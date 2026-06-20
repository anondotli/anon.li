import { Redis } from "@upstash/redis";
import { getDripCohort } from "@/lib/data/user";
import { createLogger } from "@/lib/logger";
import {
    sendDripDay1Email,
    sendDripDay3Email,
    sendDripDay7Email,
    sendDripDay14Email,
} from "@/lib/resend";

const logger = createLogger("CronDrip");

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_STAGE = 200;
const EXCLUDED_EMAILS = [
    "anita.petek3@gmail.com",
    "enej.grmek@osiria.net",
    "mcp-review@anthropic.com",
];

type DripStage = {
    day: 1 | 3 | 7 | 14;
    send: (email: string, userId: string) => Promise<{ success: boolean }>;
    activityGate?: "aliases" | "drops" | "apiKeys";
};

const STAGES: DripStage[] = [
    { day: 1, send: sendDripDay1Email, activityGate: "aliases" },
    { day: 3, send: sendDripDay3Email, activityGate: "drops" },
    { day: 7, send: sendDripDay7Email, activityGate: "apiKeys" },
    { day: 14, send: sendDripDay14Email },
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

export async function handleDripCron(): Promise<Record<string, { sent: number; skipped: number; errors: number }>> {
    const redisClient = getRedis();
    const results: Record<string, { sent: number; skipped: number; errors: number }> = {};

    for (const stage of STAGES) {
        const result = { sent: 0, skipped: 0, errors: 0 };
        const stageLabel = `day${stage.day}`;

        const users = await getDripCohort({
            minAgeMs: stage.day * DAY_MS,
            maxAgeMs: (stage.day + 2) * DAY_MS,
            excludeEmails: EXCLUDED_EMAILS,
            limit: MAX_PER_STAGE,
            activityGate: stage.activityGate,
        });

        for (const user of users) {
            const dedupeKey = `drip:${stageLabel}:${user.id}`;
            let alreadySent: string | null = null;
            try {
                alreadySent = await redisClient.get(dedupeKey);
            } catch (error) {
                logger.warn("Redis get failed - aborting stage to avoid duplicates", { dedupeKey, error });
                break;
            }
            if (alreadySent) {
                result.skipped++;
                continue;
            }

            try {
                const sendResult = await stage.send(user.email, user.id);
                if (!sendResult.success) {
                    result.errors++;
                    continue;
                }
                try {
                    await redisClient.set(dedupeKey, "1", { ex: 86400 * 90 });
                } catch (error) {
                    logger.warn("Failed to persist drip dedupe key", { dedupeKey, error });
                }
                result.sent++;
            } catch (error) {
                logger.error("Failed to send drip email", error, { userId: user.id, stage: stageLabel });
                result.errors++;
            }
        }

        results[stageLabel] = result;
    }

    return results;
}
