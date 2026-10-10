import Stripe from "stripe"
import { stripe } from "@/lib/stripe"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { getPlanFromPriceId } from "@/config/plans"
import type { Prisma } from "@prisma/client"
import { audit } from "@/lib/services/audit"
import { DAY_MS, SUBSCRIPTION_GRACE_PERIOD_DAYS } from "@/lib/constants"
import { recentDunningWhere } from "@/lib/services/billing-dunning"

const logger = createLogger("SubscriptionSync")
const FORM_ENTITLING_PRODUCTS = ["form", "bundle", "business"] as const
const PAST_DUE_RECHECK_DAYS = 3

export class InvalidSubscriptionOwnershipError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "InvalidSubscriptionOwnershipError"
    }
}

function grantsForm(product: string): boolean {
    return (FORM_ENTITLING_PRODUCTS as readonly string[]).includes(product)
}

/**
 * Map Stripe subscription status to our Subscription table status.
 * Exported for unit testing — billing access hinges on this mapping being right.
 */
export function mapStripeStatus(stripeStatus: Stripe.Subscription.Status): string {
    switch (stripeStatus) {
        case "active":
            return "active"
        case "trialing":
            return "trialing"
        case "canceled":
        case "incomplete_expired":
            return "canceled"
        case "past_due":
        case "unpaid":
        case "incomplete":
        case "paused":
            return "past_due"
        default:
            return "canceled"
    }
}

function isEntitlingStatus(status: string): boolean {
    return status === "active" || status === "trialing"
}

/**
 * Stripe moved the billing period onto subscription items (API 2025-03-31.basil).
 * Read the item period, falling back to the legacy top-level field that older
 * pinned payloads may still carry.
 */
function getSubscriptionPeriod(subscription: Stripe.Subscription): { start: Date | null; end: Date | null } {
    const item = subscription.items.data[0]
    const legacy = subscription as Stripe.Subscription & {
        current_period_start?: number | null
        current_period_end?: number | null
    }
    const start = item?.current_period_start ?? legacy.current_period_start ?? null
    const end = item?.current_period_end ?? legacy.current_period_end ?? null
    return {
        start: start ? new Date(start * 1000) : null,
        end: end ? new Date(end * 1000) : null,
    }
}

/**
 * Atomically claim the right to announce the loss of a subscription. Returns
 * true for the first loss signal only; repeated signals (dunning retries, an
 * `unpaid` update followed by deletion) return false until the subscription is
 * entitling again (upsertStripeSubscription clears the marker).
 */
export async function claimSubscriptionLossNotification(providerSubscriptionId: string): Promise<boolean> {
    const result = await prisma.subscription.updateMany({
        where: { providerSubscriptionId, lossNotifiedAt: null },
        data: { lossNotifiedAt: new Date() },
    })
    return result.count > 0
}

/**
 * Keep destructive Form retention state aligned with every canonical Stripe
 * synchronization path, including missed-webhook reconciliation. Loss only
 * establishes a deadline when the organization has no other active plan.
 */
async function syncOrganizationFormRetentionGrace(
    organizationId: string,
    status: string,
    product: string,
): Promise<void> {
    if (!grantsForm(product)) return
    if (isEntitlingStatus(status)) {
        await prisma.organization.updateMany({
            where: { id: organizationId },
            data: { formRetentionGraceUntil: null },
        })
        return
    }

    await prisma.organization.updateMany({
        where: {
            id: organizationId,
            formRetentionGraceUntil: null,
            subscriptions: {
                none: {
                    product: { in: [...FORM_ENTITLING_PRODUCTS] },
                    status: { in: ["active", "trialing"] },
                },
            },
        },
        data: {
            formRetentionGraceUntil: new Date(
                Date.now() + SUBSCRIPTION_GRACE_PERIOD_DAYS * DAY_MS,
            ),
        },
    })
}

async function syncPersonalFormRetentionGrace(
    userId: string,
    status: string,
    product: string,
): Promise<void> {
    if (!grantsForm(product)) return
    if (isEntitlingStatus(status)) {
        await prisma.user.updateMany({
            where: { id: userId },
            data: { downgradedAt: null },
        })
        return
    }

    await prisma.user.updateMany({
        where: {
            id: userId,
            downgradedAt: null,
            subscriptions: {
                none: {
                    organizationId: null,
                    product: { in: [...FORM_ENTITLING_PRODUCTS] },
                    status: { in: ["active", "trialing"] },
                },
            },
        },
        data: { downgradedAt: new Date() },
    })
}

/**
 * Upsert a Stripe subscription into the canonical Subscription table.
 * Keyed on providerSubscriptionId (unique constraint).
 * Returns true if the upsert succeeded, false if skipped (unknown price).
 */
export async function upsertStripeSubscription(
    userId: string | null,
    subscription: Stripe.Subscription,
): Promise<boolean> {
    const priceId = subscription.items.data[0]?.price.id
    if (!priceId) {
        logger.warn("Stripe subscription has no price item, skipping upsert", { subscriptionId: subscription.id })
        return false
    }

    const plan = getPlanFromPriceId(priceId)
    if (!plan) {
        logger.warn("Unknown Stripe price ID, skipping Subscription upsert", { priceId, subscriptionId: subscription.id })
        return false
    }

    const customerId = typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer.id

    const item = subscription.items.data[0]
    const { start: periodStart, end: periodEnd } = getSubscriptionPeriod(subscription)

    // Resolve the owning org and seat count, preferring the canonical local row
    // over transient Stripe metadata (metadata can be missing on renewals or
    // out-of-band subs — trusting it alone would mis-handle org cancellations and
    // could shrink a multi-seat org to 1 seat).
    const existing = await prisma.subscription.findUnique({
        where: { providerSubscriptionId: subscription.id },
        select: { seats: true, organizationId: true },
    })
    const organizationId = existing
        ? existing.organizationId
        : (subscription.metadata?.organizationId || null)

    // Business is the only organization-owned product. Enforce this at the
    // canonical billing boundary so missing/conflicting Stripe metadata cannot
    // grant a team plan to one account or attach a personal plan to a team.
    if ((plan.product === "business") !== Boolean(organizationId)) {
        await prisma.subscription.updateMany({
            where: { providerSubscriptionId: subscription.id },
            data: { status: "past_due" },
        })
        throw new InvalidSubscriptionOwnershipError(
            plan.product === "business"
                ? "Business subscriptions require organization ownership"
                : `${plan.product} subscriptions cannot be organization-owned`,
        )
    }
    // Default to the PRIOR seat count (never silently shrink to 1) when Stripe
    // omits the item quantity on a webhook payload.
    const seats = item?.quantity ?? existing?.seats ?? 1
    // For org subs, the prior seat count lets us audit real seat changes.
    const priorSeats = organizationId ? existing?.seats ?? null : null

    const status = mapStripeStatus(subscription.status)
    await prisma.subscription.upsert({
        where: { providerSubscriptionId: subscription.id },
        create: {
            userId,
            organizationId,
            provider: "stripe",
            providerSubscriptionId: subscription.id,
            providerCustomerId: customerId,
            providerPriceId: priceId,
            product: plan.product,
            tier: plan.tier,
            seats,
            status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
        },
        update: {
            // Never un-link an org on update; always propagate seat changes.
            ...(organizationId ? { organizationId } : {}),
            providerCustomerId: customerId,
            providerPriceId: priceId,
            product: plan.product,
            tier: plan.tier,
            seats,
            status,
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
            cancelAtPeriodEnd: subscription.cancel_at_period_end,
            // Recovered: a later loss must be announced again.
            ...(isEntitlingStatus(status) ? { lossNotifiedAt: null } : {}),
        },
    })

    if (organizationId) {
        await syncOrganizationFormRetentionGrace(organizationId, status, plan.product)
    } else if (userId) {
        await syncPersonalFormRetentionGrace(userId, status, plan.product)
    }

    // Audit real seat changes on an org subscription (fire-and-forget).
    if (organizationId && priorSeats !== null && priorSeats !== seats) {
        void audit({
            action: "org.billing.seats_change",
            // The original buyer may have deleted their account while the
            // subscription remains owned by the organization.
            actorId: userId ?? "system",
            targetId: subscription.id,
            organizationId,
            metadata: { from: priorSeats, to: seats },
        })
    }

    return true
}

/**
 * Cancel a canonical subscription row without a full Stripe upsert — used when
 * Stripe deletes a subscription whose price is no longer configured (e.g. a
 * legacy plan that predates a repricing) or whose ownership is invalid.
 * Revocation must not depend on price configuration, otherwise deletion events
 * for old plans 500 until Stripe gives up retrying. Re-syncs the Form retention
 * grace from the row's stored product, mirroring the resource_missing handling
 * in syncSubscriptionFromStripe.
 */
export async function markSubscriptionCanceledLocally(providerSubscriptionId: string): Promise<void> {
    const row = await prisma.subscription.findUnique({
        where: { providerSubscriptionId },
        select: { organizationId: true, userId: true, product: true },
    })
    if (!row) return

    const result = await prisma.subscription.updateMany({
        where: { providerSubscriptionId },
        data: { status: "canceled", cancelAtPeriodEnd: false },
    })
    if (result.count === 0) return

    if (row.organizationId) {
        await syncOrganizationFormRetentionGrace(row.organizationId, "canceled", row.product)
    } else if (row.userId) {
        await syncPersonalFormRetentionGrace(row.userId, "canceled", row.product)
    }
}

type PriorRowState = { status: string; lossNotifiedAt: Date | null }

/**
 * Apply loss / recovery side effects when a missed-webhook sync moves a row
 * across the entitlement boundary — the same effects the webhook would have
 * applied. A loss only counts from a state that could still be lost
 * (entitling, or dunning with no recorded loss), so re-syncing a long-ended
 * subscription never restarts a completed downgrade. Notification is deduped
 * by lossNotifiedAt inside handleLostSubscription.
 *
 * Best-effort: the status write is already committed, so failures are logged
 * and reported to the caller rather than thrown.
 */
async function applySyncedTransition(
    providerSubscriptionId: string,
    prior: PriorRowState,
    stripeStatus: Stripe.Subscription.Status | "missing",
    owner: { organizationId: string | null; userId: string | null },
): Promise<boolean> {
    try {
        const { LOST_STRIPE_STATUSES, handleLostSubscription, handleRecoveredSubscription } =
            await import("@/lib/services/subscription-loss")
        const isLost = stripeStatus === "missing" || LOST_STRIPE_STATUSES.has(stripeStatus)
        const couldBeLost = isEntitlingStatus(prior.status)
            || (prior.status === "past_due" && !prior.lossNotifiedAt)

        if (isLost && couldBeLost) {
            const user = owner.userId
                ? await prisma.user.findUnique({ where: { id: owner.userId }, select: { id: true, email: true } })
                : null
            await handleLostSubscription(providerSubscriptionId, { organizationId: owner.organizationId, user })
        } else if (
            !isEntitlingStatus(prior.status)
            && (stripeStatus === "active" || stripeStatus === "trialing")
        ) {
            await handleRecoveredSubscription(owner)
        }
        return true
    } catch (error) {
        logger.error("Failed to apply synced subscription transition", error, { subscriptionId: providerSubscriptionId })
        return false
    }
}

/**
 * Sync subscription state from Stripe to database.
 * Use this when webhooks may have been missed or for on-demand verification.
 */
export async function syncSubscriptionFromStripe(userId: string): Promise<{
    synced: boolean
    error?: string
}> {
    const SYNC_LIMIT = 50
    const subscriptions = await prisma.subscription.findMany({
        where: {
            userId,
            organizationId: null,
            provider: "stripe",
            providerSubscriptionId: { not: null },
        },
        select: {
            providerSubscriptionId: true,
            organizationId: true,
            product: true,
            status: true,
            lossNotifiedAt: true,
        },
        orderBy: { createdAt: "desc" },
        take: SYNC_LIMIT,
    })

    if (subscriptions.length === 0) {
        return { synced: true }
    }

    if (subscriptions.length === SYNC_LIMIT) {
        logger.warn("syncSubscriptionFromStripe hit row cap — older subscriptions skipped", {
            userId,
            limit: SYNC_LIMIT,
        })
    }

    let synced = 0
    let lastError: string | undefined

    for (const sub of subscriptions) {
        if (!sub.providerSubscriptionId) continue

        try {
            const subscription = await stripe.subscriptions.retrieve(sub.providerSubscriptionId)
            const upserted = await upsertStripeSubscription(userId, subscription)
            if (!upserted) {
                lastError = `Stripe subscription ${subscription.id} has an unconfigured price`
                continue
            }
            await applySyncedTransition(sub.providerSubscriptionId, sub, subscription.status, {
                organizationId: sub.organizationId,
                userId,
            })
            synced++
        } catch (error) {
            logger.error("Failed to sync subscription from Stripe", error, { subscriptionId: sub.providerSubscriptionId })

            // If subscription doesn't exist in Stripe, mark canonical row as canceled.
            if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") {
                await prisma.subscription.updateMany({
                    where: { providerSubscriptionId: sub.providerSubscriptionId },
                    data: { status: "canceled", cancelAtPeriodEnd: false },
                })
                if (sub.organizationId) {
                    await syncOrganizationFormRetentionGrace(sub.organizationId, "canceled", sub.product)
                } else {
                    await syncPersonalFormRetentionGrace(userId, "canceled", sub.product)
                }
                await applySyncedTransition(sub.providerSubscriptionId, sub, "missing", {
                    organizationId: sub.organizationId,
                    userId,
                })
                synced++
                continue
            }

            lastError = error instanceof Error ? error.message : "Unknown error"
        }
    }

    if (synced === 0 && lastError) {
        return { synced: false, error: lastError }
    }

    return { synced: true }
}

/**
 * Reconcile DB rows that are stored as active/trialing but whose billing period
 * has lapsed past the access grace window — the signature of a missed Stripe
 * webhook (a payment_failed / subscription.deleted that never reached us, leaving
 * the row permanently "active"). Re-fetches each from Stripe and writes back the
 * true status so stale rows can't inflate admin MRR or linger past their real end.
 *
 * This is a safety net for the webhook handler, not a replacement: it owns only
 * "is this still active, and until when". A targeted status/period update (rather
 * than a full upsertStripeSubscription) needs no userId, so it also covers org
 * subs whose buyer account was deleted (userId = null); plan/seat changes remain
 * the job of the customer.subscription.updated webhook.
 */
export async function reconcileStaleStripeSubscriptions(limit = 100): Promise<{
    checked: number
    revoked: number
    refreshed: number
    errors: number
}> {
    // Mirror the entitlement guards (currentPeriodEnd + 1 day): only touch rows
    // genuinely past their paid period, so a sub that renewed moments ago (webhook
    // still in flight) isn't needlessly re-fetched and flapped.
    const cutoff = new Date(Date.now() - DAY_MS)
    // past_due rows (dunning, or unpaid/paused/ownership-parked) that have not
    // been synced for a few days are re-fetched too, so a missed terminal or
    // recovery webhook heals instead of leaving the row stuck in past_due.
    const pastDueCutoff = new Date(Date.now() - PAST_DUE_RECHECK_DAYS * DAY_MS)

    const stale = await prisma.subscription.findMany({
        where: {
            provider: "stripe",
            providerSubscriptionId: { not: null },
            OR: [
                { status: { in: ["active", "trialing"] }, currentPeriodEnd: { lt: cutoff } },
                {
                    status: "past_due",
                    updatedAt: { lt: pastDueCutoff },
                    // Rows parked as past_due for invalid ownership must stay
                    // parked: this targeted status write skips the ownership
                    // validation that upsertStripeSubscription enforces.
                    NOT: {
                        OR: [
                            { product: "business", organizationId: null },
                            { product: { not: "business" }, organizationId: { not: null } },
                        ],
                    },
                },
            ],
        },
        select: {
            providerSubscriptionId: true,
            organizationId: true,
            userId: true,
            product: true,
            status: true,
            lossNotifiedAt: true,
        },
        orderBy: { updatedAt: "asc" },
        take: limit,
    })

    let checked = 0
    let revoked = 0
    let refreshed = 0
    let errors = 0

    for (const row of stale) {
        const subId = row.providerSubscriptionId
        if (!subId) continue
        checked++

        try {
            const subscription = await stripe.subscriptions.retrieve(subId)
            const { end: periodEnd } = getSubscriptionPeriod(subscription)
            const status = mapStripeStatus(subscription.status)

            await prisma.subscription.updateMany({
                where: { providerSubscriptionId: subId },
                data: {
                    status,
                    currentPeriodEnd: periodEnd,
                    cancelAtPeriodEnd: subscription.cancel_at_period_end,
                    ...(isEntitlingStatus(status) ? { lossNotifiedAt: null } : {}),
                },
            })

            if (row.organizationId) {
                await syncOrganizationFormRetentionGrace(row.organizationId, status, row.product)
            } else if (row.userId) {
                await syncPersonalFormRetentionGrace(row.userId, status, row.product)
            }

            // A missed payment_failed/deleted webhook: apply its loss effects.
            if (!await applySyncedTransition(subId, row, subscription.status, row)) {
                errors++
            }

            if (status === "active" || status === "trialing") {
                refreshed++
            } else {
                revoked++
            }
        } catch (error) {
            // Subscription no longer exists in Stripe → it's gone for good; cancel.
            if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") {
                await prisma.subscription.updateMany({
                    where: { providerSubscriptionId: subId },
                    data: { status: "canceled", cancelAtPeriodEnd: false },
                })
                if (row.organizationId) {
                    await syncOrganizationFormRetentionGrace(row.organizationId, "canceled", row.product)
                } else if (row.userId) {
                    await syncPersonalFormRetentionGrace(row.userId, "canceled", row.product)
                }
                if (!await applySyncedTransition(subId, row, "missing", row)) {
                    errors++
                }
                revoked++
                continue
            }
            // Transient (network/Stripe 5xx): leave the row for the next run.
            logger.error("Failed to reconcile subscription from Stripe", error, { subscriptionId: subId })
            errors++
        }
    }

    if (checked > 0) {
        logger.info("Reconciled stale Stripe subscriptions", { checked, revoked, refreshed, errors })
    }

    return { checked, revoked, refreshed, errors }
}

/**
 * A live personal Stripe subscription (still billing, or in dunning) that a
 * crypto activation must not silently replace: expiring it locally would leave
 * Stripe charging the card for a plan the user can no longer use. Callers
 * route such payments to manual review instead of activating.
 */
export async function findConflictingStripeSubscription(
    tx: Prisma.TransactionClient,
    userId: string,
): Promise<{ id: string; status: string } | null> {
    return tx.subscription.findFirst({
        where: {
            userId,
            organizationId: null,
            provider: "stripe",
            OR: [
                {
                    status: { in: ["active", "trialing"] },
                    OR: [
                        { currentPeriodEnd: null },
                        { currentPeriodEnd: { gt: new Date(Date.now() - DAY_MS) } },
                    ],
                },
                recentDunningWhere(),
            ],
        },
        select: { id: true, status: true },
    })
}

/**
 * Create or update a crypto subscription in the canonical Subscription table.
 * Uses a synthetic providerSubscriptionId (crypto_{orderId}) for idempotent upserts.
 * Supersedes the user's other active CRYPTO subscriptions (a renewal); other
 * providers are never touched here — see findConflictingStripeSubscription.
 *
 * Must be invoked from inside a Serializable transaction so that the
 * read-then-write logic (expire-others / upsert-this) is conflict-checked by
 * Postgres — otherwise concurrent IPNs for the same user can both observe no
 * existing actives and end up creating two simultaneously-active rows.
 */
export async function createCryptoSubscription(
    tx: Prisma.TransactionClient,
    userId: string,
    product: string,
    tier: string,
    periodStart: Date,
    periodEnd: Date,
    orderId: string,
    planPriceId: string,
): Promise<void> {
    const syntheticSubId = `crypto_${orderId}`

    // Supersede other active PERSONAL crypto subscriptions (not this one).
    // Scoped to organizationId: null so a personal crypto plan can't expire the
    // org's Business subscription (which carries the buyer's userId), and to
    // provider "crypto" so a still-billing Stripe subscription (or a manual
    // grant) is never marked expired behind the provider's back.
    await tx.subscription.updateMany({
        where: {
            userId,
            organizationId: null,
            provider: "crypto",
            status: "active",
            providerSubscriptionId: { not: syntheticSubId },
        },
        data: { status: "expired" },
    })

    // Upsert this subscription idempotently
    await tx.subscription.upsert({
        where: { providerSubscriptionId: syntheticSubId },
        create: {
            userId,
            provider: "crypto",
            providerSubscriptionId: syntheticSubId,
            providerPriceId: planPriceId,
            product,
            tier,
            status: "active",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
        },
        update: {
            providerPriceId: planPriceId,
            product,
            tier,
            status: "active",
            currentPeriodStart: periodStart,
            currentPeriodEnd: periodEnd,
        },
    })
}
