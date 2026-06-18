import { Redis } from "@upstash/redis";
import { getCryptoRenewalReminderUsers } from "@/lib/data/user";
import { createLogger } from "@/lib/logger";

const logger = createLogger("CronBilling");

let redis: Redis | null = null;

function getRedis(): Redis | null {
    if (redis) return redis;
    if (process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN) {
        redis = new Redis({
            url: process.env.UPSTASH_REDIS_REST_URL,
            token: process.env.UPSTASH_REDIS_REST_TOKEN,
        });
    }
    return redis;
}

export async function handleBillingCron() {
    const { BillingDowngradeService } = await import("@/lib/services/billing-downgrade");

    const scheduling = await BillingDowngradeService.processSchedulingBatch();
    const deletion = await BillingDowngradeService.processDeletionBatch();
    const cryptoReminders = await processCryptoRenewalReminders();
    const reconciliation = await reconcileSubscriptions();

    return {
        scheduling: { processed: scheduling.processed, errors: scheduling.errors },
        deletion: { processed: deletion.processed, errors: deletion.errors },
        cryptoReminders,
        reconciliation,
    };
}

/**
 * Safety net for missed Stripe webhooks: re-sync rows that are stored active but
 * whose period has lapsed, so a dropped payment_failed/subscription.deleted event
 * can't leave a permanently-"active" row (inflating MRR, lingering past renewal).
 *
 * Gated on STRIPE_SECRET_KEY because the Stripe client throws at construction
 * without it — skip cleanly in environments where billing isn't configured rather
 * than failing the whole billing cron. Errors are swallowed so the sibling
 * scheduling/deletion/reminder results are never lost to a Stripe outage.
 */
async function reconcileSubscriptions() {
    if (!process.env.STRIPE_SECRET_KEY) {
        return { skipped: "stripe-not-configured" as const };
    }
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

        const reminderKey = daysRemaining <= 3
            ? `crypto:renewal:3d:${user.id}`
            : daysRemaining <= 14
                ? `crypto:renewal:14d:${user.id}`
                : null;

        if (!reminderKey) continue;

        if (!redisClient) {
            logger.warn("Redis unavailable - skipping crypto renewal reminders to prevent duplicates");
            break;
        }

        let alreadySent: string | null = null;
        try {
            alreadySent = await redisClient.get(reminderKey);
        } catch (error) {
            logger.warn("Redis unavailable - skipping crypto renewal reminders to prevent duplicates", {
                reminderKey,
                error,
            });
            break;
        }
        if (alreadySent) continue;

        try {
            await sendCryptoRenewalReminderEmail(user.email, {
                daysRemaining,
                product: user.product,
                tier: user.tier,
            });

            try {
                await redisClient.set(reminderKey, "1", { ex: 86400 * 30 });
            } catch (error) {
                logger.warn("Failed to persist crypto renewal reminder dedupe key", {
                    reminderKey,
                    userId: user.id,
                    error,
                });
            }

            sent++;
        } catch (error) {
            logger.error("Failed to send crypto renewal reminder", error, { userId: user.id });
            errors++;
        }
    }

    return { sent, errors };
}
