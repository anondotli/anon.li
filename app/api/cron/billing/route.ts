import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { getCryptoRenewalReminderUsers } from "@/lib/data/user";
import { Redis } from "@upstash/redis";

const logger = createLogger("CronBilling");

// Lazy Redis initialization
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

    return {
        scheduling: { processed: scheduling.processed, errors: scheduling.errors },
        deletion: { processed: deletion.processed, errors: deletion.errors },
        cryptoReminders,
    };
}

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "billing")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const result = await handleBillingCron();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        logger.error("Billing cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };

/**
 * Send renewal reminder emails to crypto users whose subscriptions are expiring soon.
 * Sends reminders at 14 days and 3 days before expiry.
 */
async function processCryptoRenewalReminders(): Promise<{ sent: number; errors: number }> {
    const redisClient = getRedis();
    let sent = 0;
    let errors = 0;

    const now = new Date();
    const fourteenDaysOut = new Date(now);
    fourteenDaysOut.setDate(fourteenDaysOut.getDate() + 14);

    // Find crypto subscribers whose subscription expires within 14 days
    const users = await getCryptoRenewalReminderUsers(now, fourteenDaysOut);

    const { sendCryptoRenewalReminderEmail } = await import("@/lib/resend");

    for (const user of users) {
        if (!user.currentPeriodEnd) continue;

        const daysRemaining = Math.ceil(
            (user.currentPeriodEnd.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
        );

        // Determine which reminder tier (14d or 3d)
        const reminderKey = daysRemaining <= 3
            ? `crypto:renewal:3d:${user.id}`
            : daysRemaining <= 14
                ? `crypto:renewal:14d:${user.id}`
                : null;

        if (!reminderKey) continue;

        // Check if reminder already sent — require Redis for deduplication
        if (!redisClient) {
            logger.warn("Redis unavailable — skipping crypto renewal reminders to prevent duplicates");
            break;
        }
        let alreadySent: string | null = null
        try {
            alreadySent = await redisClient.get(reminderKey);
        } catch (error) {
            logger.warn("Redis unavailable — skipping crypto renewal reminders to prevent duplicates", { reminderKey, error });
            break;
        }
        if (alreadySent) continue;

        try {
            await sendCryptoRenewalReminderEmail(user.email, {
                daysRemaining,
                product: user.product,
                tier: user.tier,
            });

            // Mark as sent (TTL: 30 days)
            try {
                await redisClient.set(reminderKey, "1", { ex: 86400 * 30 });
            } catch (error) {
                logger.warn("Failed to persist crypto renewal reminder dedupe key", { reminderKey, userId: user.id, error });
            }

            sent++;
        } catch (error) {
            logger.error("Failed to send crypto renewal reminder", error, { userId: user.id });
            errors++;
        }
    }

    return { sent, errors };
}
