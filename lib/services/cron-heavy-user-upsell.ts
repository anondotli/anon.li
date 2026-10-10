import { Redis } from "@upstash/redis";
import { ALIAS_PLANS, BUNDLE_PLANS, PLAN_ENTITLEMENTS } from "@/config/plans";
import { getHeavyFreeUsers } from "@/lib/data/user";
import { createLogger } from "@/lib/logger";
import { getGrowthEmailExcludeList } from "@/lib/growth-email-exclude";
import { sendPowerUserUpsellEmail } from "@/lib/resend";

const logger = createLogger("CronHeavyUserUpsell");

const MIN_ALIASES = 5;
const MIN_EMAILS_FORWARDED = 15;
const COOLDOWN_DAYS = 21;
const MAX_PER_RUN = 50;
const MIN_ACCOUNT_AGE_MS = 24 * 60 * 60 * 1000;

let redis: Redis | null = null;

function getRedis(): Redis {
    if (redis) return redis;
    redis = new Redis({
        url: process.env.UPSTASH_REDIS_REST_URL!,
        token: process.env.UPSTASH_REDIS_REST_TOKEN!,
    });
    return redis;
}

const PAGE_SIZE = MAX_PER_RUN * 4;
const MAX_PAGES = 10;

/**
 * Streams candidates page by page. Users still inside their cooldown stay in
 * the result set, so a single fixed page would eventually be all skips and
 * starve everyone ranked below it; the page cap bounds the scan.
 */
async function* heavyCandidates() {
    const createdBefore = new Date(Date.now() - MIN_ACCOUNT_AGE_MS);
    for (let page = 0; page < MAX_PAGES; page++) {
        const rows = await getHeavyFreeUsers({
            minAliases: MIN_ALIASES,
            minEmailsForwarded: MIN_EMAILS_FORWARDED,
            excludeEmails: getGrowthEmailExcludeList(),
            createdBefore,
            limit: PAGE_SIZE,
            offset: page * PAGE_SIZE,
        });
        yield* rows;
        if (rows.length < PAGE_SIZE) return;
    }
}

export async function handleHeavyUserUpsellCron(): Promise<{ sent: number; skipped: number; errors: number }> {
    const redisClient = getRedis();

    // Anchor on the cheapest plan that removes their actual constraint — Alias
    // Plus (more aliases) — rather than the Bundle (~2.8x the price these
    // alias-only power users need). The Bundle is offered as a secondary upsell
    // inside the email. Prices are in USD, matching the pricing page, Stripe
    // and crypto checkout.
    const suggestedTier = "plus" as const;
    const aliasLimit = PLAN_ENTITLEMENTS.alias[suggestedTier].random;
    const usd = (n: number) => `$${n.toFixed(2)}/mo`;
    const price = usd(ALIAS_PLANS[suggestedTier].price.monthly);
    const bundlePrice = usd(BUNDLE_PLANS[suggestedTier].price.monthly);

    let sent = 0;
    let skipped = 0;
    let errors = 0;

    for await (const user of heavyCandidates()) {
        if (sent >= MAX_PER_RUN) break;

        const dedupeKey = `power-user-upsell:${user.id}`;
        let alreadySent: string | null = null;
        try {
            alreadySent = await redisClient.get(dedupeKey);
        } catch (error) {
            logger.warn("Redis get failed - aborting to avoid duplicate sends", { dedupeKey, error });
            errors++;
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
                suggestedTier,
                aliasLimit,
                price,
                bundlePrice,
            });

            if (!result.success) {
                errors++;
                continue;
            }

            try {
                await redisClient.set(dedupeKey, "1", { ex: 86400 * COOLDOWN_DAYS });
            } catch (error) {
                logger.warn("Failed to persist dedupe key after send", { dedupeKey, error });
                errors++;
            }

            sent++;
        } catch (error) {
            logger.error("Failed to send power-user upsell email", error, { userId: user.id });
            errors++;
        }
    }

    return { sent, skipped, errors };
}
