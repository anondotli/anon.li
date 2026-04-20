import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { getHeavyFreeUsers } from "@/lib/data/user";
import { sendPowerUserUpsellEmail } from "@/lib/resend";
import { Redis } from "@upstash/redis";
import { PLAN_ENTITLEMENTS, BUNDLE_PLANS } from "@/config/plans";

const logger = createLogger("CronHeavyUserUpsell");

const MIN_ALIASES = 5;
const MIN_EMAILS_FORWARDED = 15;
const COOLDOWN_DAYS = 21;
const MAX_PER_RUN = 50;
// Only target users who signed up more than 24h ago so we don't preempt the welcome flow.
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

// Internal/review accounts excluded from growth email targeting.
const EXCLUDED_EMAILS = [
    "anita.petek3@gmail.com",
    "enej.grmek@osiria.net",
    "mcp-review@anthropic.com",
];

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

export async function handleHeavyUserUpsellCron(): Promise<{ sent: number; skipped: number; errors: number }> {
    const redisClient = getRedis();
    if (!redisClient) {
        logger.warn("Redis unavailable — skipping heavy-user upsell cron to prevent duplicates");
        return { sent: 0, skipped: 0, errors: 0 };
    }

    const candidates = await getHeavyFreeUsers({
        minAliases: MIN_ALIASES,
        minEmailsForwarded: MIN_EMAILS_FORWARDED,
        excludeEmails: EXCLUDED_EMAILS,
        createdBefore: new Date(Date.now() - MIN_ACCOUNT_AGE_MS),
        limit: MAX_PER_RUN * 4,
    });

    const plusLimit = PLAN_ENTITLEMENTS.alias.plus.random;
    const plusMonthly = BUNDLE_PLANS.plus.price.monthly;
    const price = `$${plusMonthly.toFixed(2)}/mo`;

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for (const user of candidates) {
        if (sent >= MAX_PER_RUN) break;

        const dedupeKey = `power-user-upsell:${user.id}`;
        let alreadySent: string | null = null;
        try {
            alreadySent = await redisClient.get(dedupeKey);
        } catch (error) {
            logger.warn("Redis get failed — aborting to avoid duplicate sends", { dedupeKey, error });
            break;
        }
        if (alreadySent) {
            skipped++;
            continue;
        }

        try {
            const result = await sendPowerUserUpsellEmail(user.email, user.id, {
                aliasCount: user.aliasCount,
                emailsForwarded: user.emailsForwarded,
                suggestedTier: "plus",
                aliasLimit: plusLimit,
                price,
            });

            if (!result.success) {
                errors++;
                continue;
            }

            try {
                await redisClient.set(dedupeKey, "1", { ex: 86400 * COOLDOWN_DAYS });
            } catch (error) {
                logger.warn("Failed to persist dedupe key after send", { dedupeKey, error });
            }

            sent++;
        } catch (error) {
            logger.error("Failed to send power-user upsell email", error, { userId: user.id });
            errors++;
        }
    }

    return { sent, skipped, errors };
}

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "heavy-user-upsell")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const result = await handleHeavyUserUpsellCron();
        return NextResponse.json({ success: true, ...result });
    } catch (error) {
        logger.error("Heavy-user upsell cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
