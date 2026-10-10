import { headers } from "next/headers"
import Stripe from "stripe"
import {
    getUserIdByEmail,
    getUserIdByStripeCustomerId,
} from "@/lib/data/user"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { NextResponse, after } from "next/server"
import { Redis } from "@upstash/redis"
import { createLogger } from "@/lib/logger"
import { CHECKOUT_RECOVERY_THROTTLE_DAYS } from "@/lib/constants"
import {
    InvalidSubscriptionOwnershipError,
    markSubscriptionCanceledLocally,
    upsertStripeSubscription,
} from "@/lib/services/subscription-sync"
import { handleLostSubscription, LOST_STRIPE_STATUSES } from "@/lib/services/subscription-loss"
import { captureServerEvent, flushPostHog, trackServerEvent } from "@/lib/posthog.server"
import { getPlanFromPriceId } from "@/config/plans"

const logger = createLogger("StripeWebhook");

// Lazy Redis initialization to support testing with environment variables set after import
let redis: Redis | null = null
function getRedis(): Redis {
    if (redis) return redis
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    })
    return redis
}

/**
 * Atomically try to claim an event for processing using SET NX.
 * Returns true if this worker won the claim, false if already claimed/processed.
 *
 * Uses a short TTL (5 minutes) so that if the handler crashes mid-processing,
 * the claim expires and Stripe's retry can re-claim it.
 */
async function tryClaimEvent(eventId: string): Promise<boolean> {
    const redisClient = getRedis()
    const eventKey = `stripe:event:${eventId}`
    // SET NX with 5-minute TTL: atomic claim that auto-expires on failure
    const claimed = await redisClient.set(eventKey, "processing", { nx: true, ex: 300 })
    return claimed !== null
}

/**
 * Mark an event as permanently processed (extend TTL to 7 days).
 * Called only after all handlers complete without error.
 */
async function markEventProcessed(eventId: string): Promise<void> {
    const redisClient = getRedis()
    const eventKey = `stripe:event:${eventId}`
    await redisClient.set(eventKey, "done", { ex: 86400 * 7 })
}

/**
 * Release claim on an event so it can be retried.
 * Called when a transient error occurs.
 */
async function releaseEventClaim(eventId: string): Promise<void> {
    const redisClient = getRedis()
    const eventKey = `stripe:event:${eventId}`
    await redisClient.del(eventKey)
}

/**
 * Classify whether an error is transient (worth retrying) or permanent.
 * Transient: database errors, network errors, Redis errors.
 * Permanent: user not found or irreparably missing metadata.
 * Unknown price IDs remain retryable because deployment configuration can be
 * corrected while Stripe is retrying the event.
 */
class PermanentWebhookError extends Error {
    constructor(message: string) {
        super(message)
        this.name = "PermanentWebhookError"
    }
}

/**
 * Safely extract the price ID from a Stripe subscription.
 * Returns null if the subscription has no items (edge case during plan migration).
 */
function getSubscriptionPriceId(subscription: Stripe.Subscription): string | null {
    return subscription.items?.data?.[0]?.price?.id ?? null
}

/**
 * Resolve an invoice's subscription id. Since Stripe API 2025-03-31.basil the
 * link lives at `parent.subscription_details.subscription`; the top-level
 * `subscription` field is read only as a fallback for legacy-shaped payloads.
 */
function getInvoiceSubscriptionId(invoice: Stripe.Invoice): string | null {
    const legacy = invoice as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null }
    const ref = invoice.parent?.subscription_details?.subscription ?? legacy.subscription ?? null
    if (!ref) return null
    return typeof ref === "string" ? ref : ref.id
}

async function upsertConfiguredSubscription(userId: string | null, subscription: Stripe.Subscription): Promise<void> {
    let upserted: boolean
    try {
        upserted = await upsertStripeSubscription(userId, subscription)
    } catch (error) {
        if (error instanceof InvalidSubscriptionOwnershipError) {
            throw new PermanentWebhookError(error.message)
        }
        throw error
    }
    if (!upserted) {
        throw new Error(`Stripe subscription ${subscription.id} has an unconfigured price`)
    }
}

type CanonicalSubscriptionContext = {
    userId: string | null
    organizationId: string | null
    product: string | null
    tier: string | null
    user: { id: string; email: string } | null
}

/**
 * Sync an already-linked Stripe subscription and retain its canonical owner
 * context. Organization subscriptions survive deletion of the original buyer,
 * so their user relation can legitimately be null while the org link remains.
 */
async function syncCanonicalSubscription(
    subscription: Stripe.Subscription,
): Promise<CanonicalSubscriptionContext> {
    const local = await prisma.subscription.findUnique({
        where: { providerSubscriptionId: subscription.id },
        select: {
            userId: true,
            organizationId: true,
            product: true,
            tier: true,
            user: { select: { id: true, email: true } },
        },
    })

    if (!local) {
        // Checkout and subscription webhooks can arrive out of order. Treat a
        // missing canonical row as retryable instead of permanently acknowledging
        // an event that may carry paid-access state.
        throw new Error(`Stripe subscription ${subscription.id} is not linked locally`)
    }

    await upsertConfiguredSubscription(local.userId, subscription)

    if (
        local.organizationId
        && (subscription.status === "active" || subscription.status === "trialing")
    ) {
        await prisma.organization.update({
            where: { id: local.organizationId },
            data: { formRetentionGraceUntil: null },
        })
        // Recovered: undo the drop grace expiry a loss may have stamped.
        const { restoreOrgDropGrace } = await import("@/lib/services/org-billing")
        await restoreOrgDropGrace(local.organizationId)
    }

    return local
}

export async function POST(req: Request) {
    const body = await req.text()
    const signature = (await headers()).get("Stripe-Signature") as string

    let event: Stripe.Event

    try {
        event = stripe.webhooks.constructEvent(
            body,
            signature,
            process.env.STRIPE_WEBHOOK_SECRET!
        )
    } catch (error: unknown) {
        logger.error("Webhook signature verification failed", error);
        return new NextResponse("Webhook signature verification failed", { status: 400 })
    }

    // Atomically claim the event - prevents duplicate processing across workers
    if (!(await tryClaimEvent(event.id))) {
        logger.info(`Skipping already claimed/processed event`, { eventId: event.id });
        return new NextResponse(null, { status: 200 })
    }

    try {
        switch (event.type) {
            case "checkout.session.completed":
                await handleCheckoutSessionCompleted(event)
                break
            case "checkout.session.expired":
                await handleCheckoutSessionExpired(event)
                break
            case "invoice.payment_succeeded":
                await handleInvoicePaymentSucceeded(event.data.object as Stripe.Invoice)
                break
            case "invoice.payment_failed":
                await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice)
                break
            case "invoice.payment_action_required":
                await handleInvoicePaymentActionRequired(event.data.object as Stripe.Invoice)
                break
            case "customer.subscription.updated":
                await handleCustomerSubscriptionUpdated(event.data.object as Stripe.Subscription)
                break
            case "customer.subscription.deleted":
                await handleCustomerSubscriptionDeleted(event.data.object as Stripe.Subscription)
                break
            case "customer.subscription.resumed":
                await handleCustomerSubscriptionResumed(event.data.object as Stripe.Subscription)
                break
            default:
                // Unhandled event types are ignored
                break
        }
    } catch (error) {
        logger.error("Webhook handler failed", error, {
            eventId: event.id,
            eventType: event.type,
        });

        // Permanent errors won't be fixed by retrying - return 200 to stop retries
        if (error instanceof PermanentWebhookError) {
            await markEventProcessed(event.id)
            return new NextResponse(null, { status: 200 })
        }

        // Transient errors - release claim so Stripe retry can re-process
        await releaseEventClaim(event.id)
        return new NextResponse(null, { status: 500 })
    }

    // Mark as permanently processed after successful completion
    await markEventProcessed(event.id)

    return new NextResponse(null, { status: 200 })
}

/** Link new subscription to user account after successful checkout. */
async function handleCheckoutSessionCompleted(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session
    let userId = session?.metadata?.userId || session?.client_reference_id

    // Fallback: Try to find user by email if userId is still missing
    if (!userId && (session.customer_email || session.customer_details?.email)) {
        const email = session.customer_email || session.customer_details?.email
        if (email) {
            const user = await getUserIdByEmail(email)
            if (user) {
                userId = user.id
            }
        }
    }

    // Fallback: Try to find user by Stripe Customer ID
    if (!userId && session.customer) {
        const customerId = typeof session.customer === 'string' ? session.customer : session.customer.id

        // Check if we already have this customer ID linked
        let user = await getUserIdByStripeCustomerId(customerId)

        // If not found locally, fetch customer from Stripe to get email
        if (!user) {
            try {
                const customer = await stripe.customers.retrieve(customerId)
                if (!customer.deleted && customer.email) {
                    user = await getUserIdByEmail(customer.email)
                }
            } catch {
                // Customer lookup failed, continue without it
            }
        }

        if (user) {
            userId = user.id
        }
    }

    if (!userId) {
        // Missing metadata can't be fixed by retrying - mark as processed
        logger.error("Checkout session completed but no userId found", null, {
            eventId: event.id,
            sessionId: session.id,
            customerEmail: session.customer_email || session.customer_details?.email,
            customerId: typeof session.customer === 'string' ? session.customer : session.customer?.id,
            clientReferenceId: session.client_reference_id,
        });
        throw new PermanentWebhookError("Checkout session has no userId")
    }

    const subscriptionId = typeof session.subscription === 'string' ? session.subscription : session.subscription?.id

    if (!subscriptionId) {
        throw new PermanentWebhookError("Checkout session has no subscription")
    }

    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const sessionOrganizationId = session.metadata?.organizationId || null
    const subscriptionOrganizationId = subscription.metadata?.organizationId || null
    if (
        sessionOrganizationId
        && subscriptionOrganizationId
        && sessionOrganizationId !== subscriptionOrganizationId
    ) {
        throw new PermanentWebhookError("Checkout and subscription organization metadata conflict")
    }
    const subscriptionWithOwnership = sessionOrganizationId && !subscriptionOrganizationId
        ? {
            ...subscription,
            metadata: {
                ...subscription.metadata,
                userId,
                organizationId: sessionOrganizationId,
            },
        }
        : subscription
    const priceId = getSubscriptionPriceId(subscriptionWithOwnership)

    if (!priceId) {
        throw new Error(`Stripe subscription ${subscriptionId} has no price ID`)
    }

    // Write to canonical Subscription table (required - transient failures will retry via Stripe)
    await upsertConfiguredSubscription(userId, subscriptionWithOwnership)

    // An org checkout belongs to the organization, not to the purchaser's
    // personal account. Do not clear an unrelated personal downgrade merely
    // because that user paid on behalf of their team.
    if (!subscriptionWithOwnership.metadata?.organizationId) {
        const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
        await BillingDowngradeService.cancelDowngrade(userId)
    }

    // Authoritative, ad-blocker-proof revenue event (server-side).
    const activatedPrice = subscriptionWithOwnership.items?.data?.[0]?.price
    const activatedPlan = getPlanFromPriceId(priceId)
    captureServerEvent(userId, "subscription_activated", {
        provider: "stripe",
        product: activatedPlan?.product,
        tier: activatedPlan?.tier,
        billing_reason: "new",
        price_id: priceId,
        amount: activatedPrice?.unit_amount != null ? activatedPrice.unit_amount / 100 : undefined,
        currency: activatedPrice?.currency,
        frequency: activatedPrice?.recurring?.interval,
    })
    after(() => flushPostHog())
}

/**
 * Abandoned-checkout recovery (WS2): Stripe expires unpaid Checkout Sessions
 * ~24 h after creation, so this event IS the "checkout_started without
 * purchase" moment. Emits the funnel's loss event, then sends a one-time
 * founder-voiced recovery email.
 *
 * Expiry confers no access, so an unresolvable owner is acknowledged
 * permanently (like deletions) instead of burning Stripe's retry window, and
 * email failures are logged but never thrown — otherwise Stripe retries the
 * webhook and the user could receive the same recovery email twice.
 */
async function handleCheckoutSessionExpired(event: Stripe.Event): Promise<void> {
    const session = event.data.object as Stripe.Checkout.Session
    let userId = session?.metadata?.userId || session?.client_reference_id

    // Fallback: match by the email the customer typed into the checkout form.
    if (!userId && (session.customer_email || session.customer_details?.email)) {
        const email = session.customer_email || session.customer_details?.email
        if (email) {
            const user = await getUserIdByEmail(email)
            if (user) userId = user.id
        }
    }

    if (!userId) {
        logger.warn("Checkout session expired but no userId found", {
            eventId: event.id,
            sessionId: session.id,
            customerEmail: session.customer_email || session.customer_details?.email,
            clientReferenceId: session.client_reference_id,
        })
        throw new PermanentWebhookError("Expired checkout session has no userId")
    }

    const organizationId = session.metadata?.organizationId || null

    // Resolve the abandoned plan for the event + email copy. Webhook payloads
    // never include line_items, so the plan is read from the metadata stamped
    // at session creation; line_items stays as a fallback for expanded
    // payloads. Best-effort: recovery must not depend on price configuration
    // (a session for an archived price still deserves a recovery email).
    const price = session.line_items?.data?.[0]?.price ?? null
    const priceId = session.metadata?.priceId || price?.id || null
    const pricePlan = priceId ? getPlanFromPriceId(priceId) : null
    const plan = session.metadata?.product && session.metadata?.tier
        ? { product: session.metadata.product, tier: session.metadata.tier }
        : pricePlan
    const metadataFrequency = session.metadata?.frequency
    const frequency = metadataFrequency === "monthly"
        ? "month"
        : metadataFrequency === "yearly"
            ? "year"
            : price?.recurring?.interval

    // Funnel loss event — emitted regardless of whether the email goes out.
    trackServerEvent(userId, "checkout_expired", {
        provider: "stripe",
        product: plan?.product,
        tier: plan?.tier,
        frequency,
        price_id: priceId ?? undefined,
        is_org_checkout: Boolean(organizationId),
        session_id: session.id,
    })

    // Don't nudge someone who already converted via another session or provider
    // in the meantime. Scoped like the checkout itself: an expired team
    // checkout checks the org's subscriptions, a personal one the user's.
    const activeSubscriptions = await prisma.subscription.count({
        where: organizationId
            ? { organizationId, status: { in: ["active", "trialing"] } }
            : { userId, organizationId: null, status: { in: ["active", "trialing"] } },
    })
    if (activeSubscriptions > 0) {
        logger.info("Checkout expired but a subscription is already active; skipping recovery email", {
            userId,
            organizationId,
            sessionId: session.id,
        })
        return
    }

    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true, dripUnsubscribed: true, banned: true },
    })
    if (!user?.email) {
        logger.warn("Checkout expired but the user has no email address", {
            userId,
            sessionId: session.id,
        })
        return
    }
    // Recovery nudges are marketing-adjacent: honour the drip opt-out and never
    // nudge banned accounts. Checked before the throttle claim so an opted-out
    // user doesn't burn the window.
    if (user.dripUnsubscribed || user.banned) {
        logger.info("Checkout expired but the user is opted out or banned; skipping recovery email", {
            userId,
            sessionId: session.id,
        })
        return
    }

    // One recovery email per user per throttle window, no matter how many
    // sessions they let expire. Claim before sending; release on send failure
    // so a later expired session can still trigger the email.
    const redisClient = getRedis()
    const throttleKey = `checkout:recovery:${userId}`
    const claimed = await redisClient.set(throttleKey, "sent", {
        nx: true,
        ex: CHECKOUT_RECOVERY_THROTTLE_DAYS * 86400,
    })
    if (claimed === null) {
        logger.info("Checkout recovery email already sent recently; skipping", {
            userId,
            sessionId: session.id,
        })
        return
    }

    try {
        const { sendCheckoutRecoveryEmail } = await import("@/lib/resend")
        const result = await sendCheckoutRecoveryEmail(
            user.email,
            userId,
            { product: plan?.product ?? null, tier: plan?.tier ?? null },
            `checkout-recovery/${session.id}`,
        )
        if (!result.success) {
            await redisClient.del(throttleKey)
        }
    } catch (error) {
        await redisClient.del(throttleKey)
        logger.error("Failed to send checkout recovery email", error, {
            userId,
            sessionId: session.id,
        })
    }
}

/** Sync subscription state on successful payment (renewal or retry). */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const subscriptionId = getInvoiceSubscriptionId(invoice)
    if (!subscriptionId) return

    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const priceId = getSubscriptionPriceId(subscription)

    if (!priceId) {
        throw new Error(`Stripe subscription ${subscriptionId} has no price ID`)
    }

    // Write to the canonical row even if an org subscription's original buyer
    // has since been deleted. Personal downgrade state still requires a user.
    const context = await syncCanonicalSubscription(subscription)
    if (!context.organizationId && context.user) {
        const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
        await BillingDowngradeService.cancelDowngrade(context.user.id)
    }
}

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId = getInvoiceSubscriptionId(invoice)
    if (!subscriptionId) return

    // Force re-sync to check status (likely past_due or unpaid)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    const context = await syncCanonicalSubscription(subscription)

    // Revenue instrumentation: a failed payment attempt. Stripe fires one event
    // per retry (each a distinct event id, so the idempotency guard doesn't dedupe
    // them — invoice_id lets dashboards do so). billing_reason "subscription_cycle"
    // failures are the involuntary-churn (dunning) signal; "subscription_create"
    // failures are abandoned first purchases.
    const failedDistinctId = context.user?.id ?? context.organizationId
    if (failedDistinctId) {
        trackServerEvent(failedDistinctId, "purchase_failed", {
            provider: "stripe",
            product: context.product ?? undefined,
            tier: context.tier ?? undefined,
            billing_reason: invoice.billing_reason ?? "unknown",
            amount: invoice.amount_due != null ? invoice.amount_due / 100 : undefined,
            currency: invoice.currency,
            failure_code: invoice.last_finalization_error?.code ?? "unknown",
            invoice_id: invoice.id,
        })
    } else {
        logger.warn("Payment failed but no user/org to attribute", {
            subscriptionId,
            invoiceId: invoice.id,
        })
    }

    // While Stripe is still retrying (past_due) access is suspended by the
    // status sync alone; drops are only put on an expiry clock once dunning
    // has given up. The org path does not require the (possibly deleted)
    // buyer; it notifies current admins.
    if (LOST_STRIPE_STATUSES.has(subscription.status)) {
        await handleLostSubscription(subscription.id, context)
    }
}

/**
 * Handle 3D Secure / Strong Customer Authentication (SCA) requirement
 * This fires when a European payment requires additional authentication
 */
async function handleInvoicePaymentActionRequired(invoice: Stripe.Invoice) {
    const subscriptionId = getInvoiceSubscriptionId(invoice)
    if (!subscriptionId) return

    const context = await prisma.subscription.findUnique({
        where: { providerSubscriptionId: subscriptionId },
        select: {
            organizationId: true,
            user: { select: { id: true, email: true } },
        },
    })
    if (!context) {
        throw new Error(`Stripe subscription ${subscriptionId} is not linked locally`)
    }

    if (invoice.hosted_invoice_url) {
        const { sendPaymentActionRequiredEmail } = await import("@/lib/resend")
        if (context.organizationId) {
            const { getOrgAdminEmails } = await import("@/lib/data/organization")
            const emails = await getOrgAdminEmails(context.organizationId)
            await Promise.all(emails.map((email) =>
                sendPaymentActionRequiredEmail(email, invoice.hosted_invoice_url!),
            ))
        } else if (context.user) {
            await sendPaymentActionRequiredEmail(context.user.email, invoice.hosted_invoice_url)
        }
    }

    logger.info("Payment action required", {
        subscriptionId,
        invoiceId: invoice.id,
        userId: context.user?.id,
        organizationId: context.organizationId,
    });
}

/** Sync plan/price changes and detect cancellation or status changes. */
async function handleCustomerSubscriptionUpdated(eventSubscription: Stripe.Subscription) {
    // Event snapshots can arrive out of order (and retries replay old ones), so
    // sync the subscription's CURRENT state rather than trusting the payload.
    let subscription: Stripe.Subscription
    try {
        subscription = await stripe.subscriptions.retrieve(eventSubscription.id)
    } catch (error) {
        if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") {
            // Gone at Stripe: customer.subscription.deleted owns revocation.
            logger.info("Updated subscription no longer exists at Stripe; deferring to deletion event", {
                subscriptionId: eventSubscription.id,
            })
            return
        }
        throw error
    }

    const priceId = getSubscriptionPriceId(subscription)

    if (!priceId) {
        throw new Error(`Stripe subscription ${subscription.id} has no price ID`)
    }

    const isActive = subscription.status === 'active' || subscription.status === 'trialing'

    const context = await syncCanonicalSubscription(subscription)

    if (isActive) return

    // Still in dunning (past_due/incomplete): access is suspended by the status
    // sync, but the resource-deletion clock only starts on a terminal loss.
    if (LOST_STRIPE_STATUSES.has(subscription.status)) {
        await handleLostSubscription(subscription.id, context)
    }
}

/**
 * Resolve the owner of a deleted subscription that has no canonical row.
 * Tries in order: another canonical row for the same Stripe customer (the user
 * re-subscribed since), then the Stripe customer's email address. Returns null
 * when nobody is resolvable; transient Stripe failures propagate so the
 * webhook retries, but a purged customer returns null (it can never resolve).
 */
async function resolveUnlinkedSubscriptionOwner(
    subscription: Stripe.Subscription,
): Promise<{ id: string; email: string } | null> {
    const customerId = typeof subscription.customer === "string"
        ? subscription.customer
        : subscription.customer?.id
    if (!customerId) return null

    const byCustomer = await getUserIdByStripeCustomerId(customerId)
    if (byCustomer) {
        const user = await prisma.user.findUnique({
            where: { id: byCustomer.id },
            select: { id: true, email: true },
        })
        if (user) return user
    }

    let customer: Stripe.Customer | Stripe.DeletedCustomer
    try {
        customer = await stripe.customers.retrieve(customerId)
    } catch (error) {
        if (error instanceof Stripe.errors.StripeInvalidRequestError && error.code === "resource_missing") {
            return null
        }
        throw error
    }
    if (customer.deleted || !customer.email) return null

    const byEmail = await getUserIdByEmail(customer.email)
    if (!byEmail) return null
    return prisma.user.findUnique({
        where: { id: byEmail.id },
        select: { id: true, email: true },
    })
}

/**
 * Revoke access, set grace period on drops, and begin downgrade flow.
 *
 * Deletion is revocation: unlike access-granting events — which retry while a
 * canonical row or price config is missing, because a retry may still confer
 * paid access — a failing deletion only leaves stale state and burns Stripe's
 * retry window, so this handler resolves what it can and acknowledges
 * permanently once there is genuinely nothing left to revoke.
 */
async function handleCustomerSubscriptionDeleted(subscription: Stripe.Subscription) {
    const local = await prisma.subscription.findUnique({
        where: { providerSubscriptionId: subscription.id },
        select: {
            userId: true,
            organizationId: true,
            product: true,
            tier: true,
            user: { select: { id: true, email: true } },
        },
    })

    let context: CanonicalSubscriptionContext
    if (local) {
        // Sync the canonical row to canceled. If the price is no longer
        // configured (legacy plan predating a repricing) or the ownership is
        // invalid, the full upsert cannot run — fall back to a targeted
        // cancellation so revocation is never blocked on price configuration.
        let upserted = false
        try {
            upserted = await upsertStripeSubscription(local.userId, subscription)
        } catch (error) {
            if (!(error instanceof InvalidSubscriptionOwnershipError)) throw error
            logger.warn("Subscription deleted with invalid ownership; canceling canonical row", {
                subscriptionId: subscription.id,
                reason: error.message,
            })
        }
        if (!upserted) {
            await markSubscriptionCanceledLocally(subscription.id)
        }
        context = local
    } else {
        // No canonical row: a legacy subscription that predates the
        // Subscription table, or a checkout we never persisted. Try to resolve
        // the owner so the downgrade side effects still run.
        const owner = await resolveUnlinkedSubscriptionOwner(subscription)
        if (!owner) {
            // Nobody to revoke — acknowledge permanently instead of returning
            // 500 until Stripe gives up retrying.
            logger.warn("Subscription deleted without a local row or resolvable owner; acknowledging", {
                subscriptionId: subscription.id,
                customerId: typeof subscription.customer === "string"
                    ? subscription.customer
                    : subscription.customer?.id,
            })
            throw new PermanentWebhookError(
                `Stripe subscription ${subscription.id} has no local row and no resolvable owner`,
            )
        }
        context = { userId: owner.id, organizationId: null, product: null, tier: null, user: owner }
    }

    // Revenue instrumentation: subscription ended. cancel_reason "payment_failed"
    // = involuntary churn; "cancellation_requested" = voluntary.
    const canceledDistinctId = context.user?.id ?? context.organizationId
    if (canceledDistinctId) {
        trackServerEvent(canceledDistinctId, "subscription_canceled", {
            provider: "stripe",
            product: context.product ?? undefined,
            tier: context.tier ?? undefined,
            cancel_reason: subscription.cancellation_details?.reason ?? "unknown",
        })
    }

    // A deletion without a canonical row has nowhere to record the
    // notification claim; it is a one-off event, so always notify.
    await handleLostSubscription(subscription.id, context, local ? {} : { notify: true })
}

/** Restore access and cancel any active downgrade when a paused subscription resumes. */
async function handleCustomerSubscriptionResumed(subscription: Stripe.Subscription) {
    const priceId = getSubscriptionPriceId(subscription)

    if (!priceId) {
        throw new Error(`Stripe subscription ${subscription.id} has no price ID`)
    }

    // Always restore canonical org status/seats, even if its buyer was deleted.
    // Personal downgrade state still requires a live user.
    const context = await syncCanonicalSubscription(subscription)
    if (!context.organizationId && context.user) {
        const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
        await BillingDowngradeService.cancelDowngrade(context.user.id)
    }
}
