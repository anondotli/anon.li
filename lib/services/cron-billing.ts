import { Redis } from "@upstash/redis";
import { getCryptoRenewalReminderUsers } from "@/lib/data/user";
import { createLogger } from "@/lib/logger";

const logger = createLogger("CronBilling");

let redis: Redis | null = null;

function getRedis(): Redis {
    if (redis) return redis;
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return redis;
}

export async function handleBillingCron() {
    const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade");

    // Expire lapsed crypto rows first so their owners enter the downgrade
    // flow in this same run's bookkeeping rather than a day later.
    const cryptoExpiry = await expireCryptoSubscriptions();
    const heldCryptoPayments = await recheckHeldCryptoPayments();
    const scheduling = await BillingDowngradeService.processSchedulingBatch();
    const deletion = await BillingDowngradeService.processDeletionBatch();
    const cryptoReminders = await processCryptoRenewalReminders();
    const reconciliation = await reconcileSubscriptions();

    return {
        scheduling: { processed: scheduling.processed, errors: scheduling.errors },
        deletion: { processed: deletion.processed, errors: deletion.errors },
        cryptoExpiry,
        heldCryptoPayments,
        cryptoReminders,
        reconciliation,
    };
}

/**
 * Paid crypto invoices held for review (a live Stripe subscription conflicted)
 * get no further provider callbacks; activate them once the conflict is gone.
 */
async function recheckHeldCryptoPayments() {
    try {
        const { recheckHeldCryptoPayments: recheck } = await import("@/lib/services/crypto-activation");
        const result = await recheck();
        if (result.activated > 0) {
            const { flushPostHog } = await import("@/lib/posthog.server");
            await flushPostHog();
        }
        return result;
    } catch (error) {
        logger.error("Held crypto payment re-check failed", error);
        return { error: "failed" as const };
    }
}

/**
 * Crypto subscriptions are prepaid with no provider-side lifecycle, so this is
 * the only path that ends them. Errors are swallowed like reconciliation so the
 * sibling results are never lost.
 */
async function expireCryptoSubscriptions() {
    try {
        const { expireLapsedCryptoSubscriptions } = await import("@/lib/services/crypto-subscription");
        return await expireLapsedCryptoSubscriptions();
    } catch (error) {
        logger.error("Crypto subscription expiry failed", error);
        return { error: "failed" as const };
    }
}

/**
 * Safety net for missed Stripe webhooks: re-sync rows that are stored active but
 * whose period has lapsed, so a dropped payment_failed/subscription.deleted event
 * can't leave a permanently-"active" row (inflating MRR, lingering past renewal).
 *
 * Errors are swallowed so the sibling scheduling/deletion/reminder results are
 * never lost to a Stripe outage.
 */
async function reconcileSubscriptions() {
    try {
        const { reconcileStaleStripeSubscriptions } = await import("@/lib/services/subscription-sync");
        return await reconcileStaleStripeSubscriptions();
    } catch (error) {
        logger.error("Subscription reconciliation failed", error);
        return { error: "failed" as const };
    }
}

async function processCryptoRenewalReminders(): Promise<{ sent: number; errors: number }> {
    const redisClient = getRedis();
    let sent = 0;
    let errors = 0;

    const now = new Date();
    const fourteenDaysOut = new Date(now);
    fourteenDaysOut.setDate(fourteenDaysOut.getDate() + 14);

    const users = await getCryptoRenewalReminderUsers(now, fourteenDaysOut);
    const { sendCryptoRenewalReminderEmail } = await import("@/lib/resend");

    for (const user of users) {
        if (!user.currentPeriodEnd) continue;

        const daysRemaining = Math.ceil(
            (user.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Scope dedupe to the paid period, so every period (e.g. each month of
        // a monthly plan, or a renewal) gets its own 14-day and 3-day reminder.
        const periodKey = user.currentPeriodEnd.toISOString().slice(0, 10);
        const stage = daysRemaining <= 3 ? "3d" : daysRemaining <= 14 ? "14d" : null;
        if (!stage) continue;
        const reminderKey = `crypto:renewal:${stage}:${user.id}:${periodKey}`;

        let alreadySent: string | null = null;
        try {
            alreadySent = await redisClient.get(reminderKey);
        } catch (error) {
            logger.warn("Redis unavailable - skipping crypto renewal reminders to prevent duplicates", {
                reminderKey,
                error,
            });
            errors++;
            break;
        }
        if (alreadySent) continue;

        try {
            const result = await sendCryptoRenewalReminderEmail(user.email, {
                daysRemaining,
                product: user.product,
                tier: user.tier,
            }, `crypto-renewal-${stage}/${user.id}/${periodKey}`);
            if (!result.success) {
                errors++;
                continue;
            }

            try {
                await redisClient.set(reminderKey, "1", { ex: 86400 * 30 });
            } catch (error) {
                logger.warn("Failed to persist crypto renewal reminder dedupe key", {
                    reminderKey,
                    userId: user.id,
                    error,
                });
                errors++;
            }

            sent++;
        } catch (error) {
            logger.error("Failed to send crypto renewal reminder", error, { userId: user.id });
            errors++;
        }
    }

    return { sent, errors };
}
