import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";
import { getDripCohort } from "@/lib/data/user";
import {
    sendDripDay1Email,
    sendDripDay3Email,
    sendDripDay7Email,
    sendDripDay14Email,
} from "@/lib/resend";
import { Redis } from "@upstash/redis";

const logger = createLogger("CronDrip");

const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_PER_STAGE = 200;

// Internal/review accounts excluded from growth email targeting.
const EXCLUDED_EMAILS = [
    "anita.petek3@gmail.com",
    "enej.grmek@osiria.net",
    "mcp-review@anthropic.com",
];

type DripStage = {
    day: 1 | 3 | 7 | 14;
    send: (email: string, userId: string) => Promise<{ success: boolean }>;
    // Skip users who've already done the thing this email is asking them to do.
    // Day 14 has no gate because paid users are excluded at the cohort level.
    activityGate?: "aliases" | "drops" | "apiKeys";
};

const STAGES: DripStage[] = [
    { day: 1, send: sendDripDay1Email, activityGate: "aliases" },
    { day: 3, send: sendDripDay3Email, activityGate: "drops" },
    { day: 7, send: sendDripDay7Email, activityGate: "apiKeys" },
    { day: 14, send: sendDripDay14Email },
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

export async function handleDripCron(): Promise<Record<string, { sent: number; skipped: number; errors: number }>> {
    const redisClient = getRedis();
    if (!redisClient) {
        logger.warn("Redis unavailable — skipping drip cron to prevent duplicates");
        return {};
    }

    const results: Record<string, { sent: number; skipped: number; errors: number }> = {};

    for (const stage of STAGES) {
        const result = { sent: 0, skipped: 0, errors: 0 };
        const stageLabel = `day${stage.day}`;

        // [N, N+2) day window — catches stragglers if a cron run is missed by ~1 day.
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
                logger.warn("Redis get failed — aborting stage to avoid duplicates", { dedupeKey, error });
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
                    // Keep a long dedupe TTL so the same user never receives the same stage twice.
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

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "drip")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    try {
        const results = await handleDripCron();
        return NextResponse.json({ success: true, results });
    } catch (error) {
        logger.error("Drip cron failed", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
}

export { handleCron as GET, handleCron as POST };
