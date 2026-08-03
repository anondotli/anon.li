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
import { SUBSCRIPTION_GRACE_PERIOD_DAYS, DOWNGRADE_SCHEDULING_DELAY_DAYS, DOWNGRADE_DELETION_DELAY_DAYS } from "@/lib/constants"
import {
    InvalidSubscriptionOwnershipError,
    upsertStripeSubscription,
} from "@/lib/services/subscription-sync"
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
    }

    return local
}

/**
 * Handle downgrade notification after subscription loss.
 * Shared by handleInvoicePaymentFailed and handleCustomerSubscriptionDeleted.
 *
 * Email failures are logged but never thrown — otherwise Stripe retries the
 * whole webhook, re-running idempotent DB writes but also re-sending the email.
 */
async function handleDowngradeNotification(userId: string, email: string, dropExpiryDate: Date): Promise<void> {
    const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
    await BillingDowngradeService.recordDowngrade(userId)

    const excess = await BillingDowngradeService.calculateExcess(userId)
    const hasExcess = excess.excessRandom + excess.excessCustom + excess.excessDomains + excess.excessRecipients > 0

    try {
        if (hasExcess) {
            const schedulingDate = new Date()
            schedulingDate.setDate(schedulingDate.getDate() + DOWNGRADE_SCHEDULING_DELAY_DAYS)
            const deletionDate = new Date()
            deletionDate.setDate(deletionDate.getDate() + DOWNGRADE_SCHEDULING_DELAY_DAYS + DOWNGRADE_DELETION_DELAY_DAYS)

            const { sendDowngradeWarningEmail } = await import("@/lib/resend")
            await sendDowngradeWarningEmail(email, excess, schedulingDate, deletionDate)
        } else {
            const { sendSubscriptionCanceledEmail } = await import("@/lib/resend")
            await sendSubscriptionCanceledEmail(email, dropExpiryDate)
        }
    } catch (error) {
        logger.error("Failed to send downgrade notification email", error, { userId })
    }
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

/** Sync subscription state on successful payment (renewal or retry). */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as Stripe.Subscription)?.id
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
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as Stripe.Subscription)?.id
    if (!subscriptionId) return

    // Force re-sync to check status (likely past_due or unpaid)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    const isActive = subscription.status === 'active' || subscription.status === 'trialing'

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

    // If access is revoked, set drop expiry and send notification. The org path
    // does not require the (possibly deleted) buyer; it notifies current admins.
    if (context && !isActive) {
        const expiryDate = new Date()
        expiryDate.setDate(expiryDate.getDate() + SUBSCRIPTION_GRACE_PERIOD_DAYS)

        if (context.organizationId) {
            const { handleOrgSubscriptionLoss } = await import("@/lib/services/org-billing")
            await handleOrgSubscriptionLoss(context.organizationId, expiryDate)
        } else if (context.user) {
            // Only update drops that don't already have an expiry (unlimited drops)
            await prisma.drop.updateMany({
                where: {
                    userId: context.user.id,
                    organizationId: null,
                    expiresAt: null,
                    deletedAt: null,
                },
                data: {
                    expiresAt: expiryDate,
                },
            })

            await handleDowngradeNotification(context.user.id, context.user.email, expiryDate)
        }
    }
}

/**
 * Handle 3D Secure / Strong Customer Authentication (SCA) requirement
 * This fires when a European payment requires additional authentication
 */
async function handleInvoicePaymentActionRequired(invoice: Stripe.Invoice) {
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as Stripe.Subscription)?.id
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
async function handleCustomerSubscriptionUpdated(subscription: Stripe.Subscription) {
    const priceId = getSubscriptionPriceId(subscription)

    if (!priceId) {
        throw new Error(`Stripe subscription ${subscription.id} has no price ID`)
    }

    // Only sync price if subscription is active or trialing
    const isActive = subscription.status === 'active' || subscription.status === 'trialing'

    const context = await syncCanonicalSubscription(subscription)

    // Record downgrade if subscription became inactive.
    if (context && !isActive) {
        if (context.organizationId) {
            const expiryDate = new Date()
            expiryDate.setDate(expiryDate.getDate() + SUBSCRIPTION_GRACE_PERIOD_DAYS)
            const { handleOrgSubscriptionLoss } = await import("@/lib/services/org-billing")
            await handleOrgSubscriptionLoss(context.organizationId, expiryDate)
        } else if (context.user) {
            const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
            await BillingDowngradeService.recordDowngrade(context.user.id)
        }
    }
}

/** Revoke access, set grace period on drops, and begin downgrade flow. */
async function handleCustomerSubscriptionDeleted(subscription: Stripe.Subscription) {
    // Calculate grace period expiry deadline
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + SUBSCRIPTION_GRACE_PERIOD_DAYS)

    const context = await syncCanonicalSubscription(subscription)
    if (!context) return

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

    // Org subscription: downgrade the ORG (grace on org drops, notify all org
    // admins), not the billing user's personal account.
    if (context.organizationId) {
        const { handleOrgSubscriptionLoss } = await import("@/lib/services/org-billing")
        await handleOrgSubscriptionLoss(context.organizationId, expiryDate)
        return
    }

    if (context.user) {
        // Set grace period expiry on all unlimited drops (Pro feature)
        await prisma.drop.updateMany({
            where: {
                userId: context.user.id,
                organizationId: null,
                expiresAt: null, // Only drops with unlimited expiry
                deletedAt: null,
            },
            data: {
                expiresAt: expiryDate,
            },
        })

        await handleDowngradeNotification(context.user.id, context.user.email, expiryDate)
    }
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
