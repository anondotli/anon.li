import { headers } from "next/headers"
import Stripe from "stripe"
import {
    getUserByStripeSubscriptionId,
    getUserIdByEmail,
    getUserIdByStripeCustomerId,
} from "@/lib/data/user"
import { prisma } from "@/lib/prisma"
import { stripe } from "@/lib/stripe"
import { NextResponse } from "next/server"
import { Redis } from "@upstash/redis"
import { createLogger } from "@/lib/logger"
import { SUBSCRIPTION_GRACE_PERIOD_DAYS, DOWNGRADE_SCHEDULING_DELAY_DAYS, DOWNGRADE_DELETION_DELAY_DAYS } from "@/lib/constants"
import { upsertStripeSubscription } from "@/lib/services/subscription-sync"

const logger = createLogger("StripeWebhook");

// Lazy Redis initialization to support testing with environment variables set after import
let redis: Redis | null = null
function getRedis(): Redis | null {
    if (redis) return redis
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        })
    }
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
    if (!redisClient) return true // No Redis = process optimistically

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
    if (!redisClient) return

    const eventKey = `stripe:event:${eventId}`
    await redisClient.set(eventKey, "done", { ex: 86400 * 7 })
}

/**
 * Release claim on an event so it can be retried.
 * Called when a transient error occurs.
 */
async function releaseEventClaim(eventId: string): Promise<void> {
    const redisClient = getRedis()
    if (!redisClient) return

    const eventKey = `stripe:event:${eventId}`
    await redisClient.del(eventKey)
}

/**
 * Classify whether an error is transient (worth retrying) or permanent.
 * Transient: database errors, network errors, Redis errors.
 * Permanent: user not found, missing metadata, unknown price ID.
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
    const priceId = getSubscriptionPriceId(subscription)

    if (!priceId) {
        throw new PermanentWebhookError(`Subscription ${subscriptionId} has no price ID`)
    }

    // Write to canonical Subscription table (required - transient failures will retry via Stripe)
    await upsertStripeSubscription(userId, subscription)

    // Cancel any active downgrade since user just subscribed
    const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
    await BillingDowngradeService.cancelDowngrade(userId)
}

/** Sync subscription state on successful payment (renewal or retry). */
async function handleInvoicePaymentSucceeded(invoice: Stripe.Invoice) {
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as Stripe.Subscription)?.id
    if (!subscriptionId) return

    const subscription = await stripe.subscriptions.retrieve(subscriptionId)
    const priceId = getSubscriptionPriceId(subscription)

    if (!priceId) {
        logger.error("Subscription has no price ID on payment success", null, { subscriptionId })
        return
    }

    // Cancel any active downgrade - payment succeeded (e.g. retry after failure)
    const user = await getUserByStripeSubscriptionId(subscription.id)
    if (user) {
        // Write to canonical Subscription table (required - transient failures will retry via Stripe)
        await upsertStripeSubscription(user.id, subscription)

        const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
        await BillingDowngradeService.cancelDowngrade(user.id)
    }
}

/** Revoke access and begin downgrade flow if payment fails and subscription is no longer active. */
async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
    const subscriptionId = typeof invoice.subscription === 'string' ? invoice.subscription : (invoice.subscription as Stripe.Subscription)?.id
    if (!subscriptionId) return

    // Force re-sync to check status (likely past_due or unpaid)
    const subscription = await stripe.subscriptions.retrieve(subscriptionId)

    const isActive = subscription.status === 'active' || subscription.status === 'trialing'

    // Find user first
    const user = await getUserByStripeSubscriptionId(subscription.id)

    if (user) {
        // Write to canonical Subscription table (required - transient failures will retry via Stripe)
        await upsertStripeSubscription(user.id, subscription)

        // If access revoked, set drop expiry and send notification
        if (!isActive) {
            const expiryDate = new Date()
            expiryDate.setDate(expiryDate.getDate() + SUBSCRIPTION_GRACE_PERIOD_DAYS)

            // Only update drops that don't already have an expiry (unlimited drops)
            await prisma.drop.updateMany({
                where: {
                    userId: user.id,
                    expiresAt: null,
                    deletedAt: null,
                },
                data: {
                    expiresAt: expiryDate,
                },
            })

            await handleDowngradeNotification(user.id, user.email, expiryDate)
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

    // Find user by subscription
    const user = await getUserByStripeSubscriptionId(subscriptionId)

    if (user && invoice.hosted_invoice_url) {
        // Send email to user with link to complete payment authentication
        const { sendPaymentActionRequiredEmail } = await import("@/lib/resend")
        await sendPaymentActionRequiredEmail(user.email, invoice.hosted_invoice_url)
    }

    logger.info("Payment action required", {
        subscriptionId,
        invoiceId: invoice.id,
        userId: user?.id,
    });
}

/** Sync plan/price changes and detect cancellation or status changes. */
async function handleCustomerSubscriptionUpdated(subscription: Stripe.Subscription) {
    const priceId = getSubscriptionPriceId(subscription)

    if (!priceId) {
        logger.error("Subscription has no price ID on update", null, { subscriptionId: subscription.id })
        return
    }

    // Only sync price if subscription is active or trialing
    const isActive = subscription.status === 'active' || subscription.status === 'trialing'

    // Write to canonical Subscription table (required - transient failures will retry via Stripe)
    const userForUpsert = await getUserByStripeSubscriptionId(subscription.id)
    if (userForUpsert) {
        await upsertStripeSubscription(userForUpsert.id, subscription)

        // Record downgrade if subscription became inactive
        if (!isActive) {
            const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
            await BillingDowngradeService.recordDowngrade(userForUpsert.id)
        }
    }
}

/** Revoke access, set grace period on drops, and begin downgrade flow. */
async function handleCustomerSubscriptionDeleted(subscription: Stripe.Subscription) {
    // Calculate grace period expiry deadline
    const expiryDate = new Date()
    expiryDate.setDate(expiryDate.getDate() + SUBSCRIPTION_GRACE_PERIOD_DAYS)

    // Find user and update subscription status
    const user = await getUserByStripeSubscriptionId(subscription.id)

    if (user) {
        // Write to canonical Subscription table (required - transient failures will retry via Stripe)
        await upsertStripeSubscription(user.id, subscription)

        // Set grace period expiry on all unlimited drops (Pro feature)
        await prisma.drop.updateMany({
            where: {
                userId: user.id,
                expiresAt: null, // Only drops with unlimited expiry
                deletedAt: null,
            },
            data: {
                expiresAt: expiryDate,
            },
        })

        await handleDowngradeNotification(user.id, user.email, expiryDate)
    }
}

/** Restore access and cancel any active downgrade when a paused subscription resumes. */
async function handleCustomerSubscriptionResumed(subscription: Stripe.Subscription) {
    const priceId = getSubscriptionPriceId(subscription)

    if (!priceId) {
        logger.error("Subscription has no price ID on resume", null, { subscriptionId: subscription.id })
        return
    }

    // Cancel any active downgrade since subscription resumed
    const user = await getUserByStripeSubscriptionId(subscription.id)
    if (user) {
        // Write to canonical Subscription table (required - transient failures will retry via Stripe)
        await upsertStripeSubscription(user.id, subscription)

        const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade")
        await BillingDowngradeService.cancelDowngrade(user.id)
    }
}
