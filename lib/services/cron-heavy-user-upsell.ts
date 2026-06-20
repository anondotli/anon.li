import { Redis } from "@upstash/redis";
import { BUNDLE_PLANS, PLAN_ENTITLEMENTS } from "@/config/plans";
import { getHeavyFreeUsers } from "@/lib/data/user";
import { createLogger } from "@/lib/logger";
import { sendPowerUserUpsellEmail } from "@/lib/resend";

const logger = createLogger("CronHeavyUserUpsell");

const MIN_ALIASES = 5;
const MIN_EMAILS_FORWARDED = 15;
const COOLDOWN_DAYS = 21;
const MAX_PER_RUN = 50;
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;
const EXCLUDED_EMAILS = [
    "anita.petek3@gmail.com",
    "enej.grmek@osiria.net",
    "mcp-review@anthropic.com",
];

let redis: Redis | null = null;

function getRedis(): Redis {
    if (redis) return redis;
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return redis;
}

export async function handleHeavyUserUpsellCron(): Promise<{ sent: number; skipped: number; errors: number }> {
    const redisClient = getRedis();
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
            logger.warn("Redis get failed - aborting to avoid duplicate sends", { dedupeKey, error });
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
