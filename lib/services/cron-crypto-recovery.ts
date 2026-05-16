import { Redis } from "@upstash/redis";
import { getWaitingCryptoInvoices, expireCryptoInvoice } from "@/lib/data/crypto-payment";
import { createLogger } from "@/lib/logger";
import {
    sendCryptoInvoiceExpiredEmail,
    sendCryptoInvoiceReminderEmail,
} from "@/lib/resend";

const logger = createLogger("CronCryptoRecovery");

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const REMINDER_THRESHOLD_HOURS = 24;
const EXPIRY_THRESHOLD_DAYS = 7;
const MAX_PER_RUN = 100;

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

export async function handleCryptoRecoveryCron(): Promise<{
    remindersSent: number;
    expired: number;
    expiredEmailsSent: number;
    errors: number;
}> {
    const redisClient = getRedis();
    if (!redisClient) {
        logger.warn("Redis unavailable - skipping crypto recovery cron to prevent duplicates");
        return { remindersSent: 0, expired: 0, expiredEmailsSent: 0, errors: 0 };
    }

    const now = Date.now();
    const reminderCutoff = new Date(now - REMINDER_THRESHOLD_HOURS * HOUR_MS);
    const expiryCutoff = new Date(now - EXPIRY_THRESHOLD_DAYS * DAY_MS);
    const floorCutoff = new Date(now - 30 * DAY_MS);

    const invoices = await getWaitingCryptoInvoices({
        createdBefore: reminderCutoff,
        createdAfter: floorCutoff,
        limit: MAX_PER_RUN,
    });

    let remindersSent = 0;
    let expired = 0;
    let expiredEmailsSent = 0;
    let errors = 0;

    for (const invoice of invoices) {
        const email = invoice.user?.email;
        if (!email) continue;

        const ageMs = now - invoice.createdAt.getTime();
        const hoursPending = Math.floor(ageMs / HOUR_MS);
        const isExpired = invoice.createdAt < expiryCutoff;

        if (isExpired) {
            const dedupeKey = `crypto-recovery:expired:${invoice.id}`;
            let alreadySent: string | null = null;
            try {
                alreadySent = await redisClient.get(dedupeKey);
            } catch (error) {
                logger.warn("Redis get failed - skipping invoice", { dedupeKey, error });
                continue;
            }
            if (alreadySent) continue;

            try {
                const flip = await expireCryptoInvoice(invoice.id);
                if (flip.count === 0) {
                    continue;
                }
                expired++;

                const result = await sendCryptoInvoiceExpiredEmail(email, {
                    product: invoice.product,
                    tier: invoice.tier,
                    priceUsd: invoice.priceAmount,
                });
                if (result.success) {
                    expiredEmailsSent++;
                    try {
                        await redisClient.set(dedupeKey, "1", { ex: 86400 * 90 });
                    } catch (error) {
                        logger.warn("Failed to persist expired dedupe key", { dedupeKey, error });
                    }
                } else {
                    errors++;
                }
            } catch (error) {
                logger.error("Failed to expire crypto invoice", error, { invoiceId: invoice.id });
                errors++;
            }
            continue;
        }

        const dedupeKey = `crypto-recovery:reminder:${invoice.id}`;
        let alreadySent: string | null = null;
        try {
            alreadySent = await redisClient.get(dedupeKey);
        } catch (error) {
            logger.warn("Redis get failed - skipping invoice", { dedupeKey, error });
            continue;
        }
        if (alreadySent) continue;

        try {
            const result = await sendCryptoInvoiceReminderEmail(email, {
                product: invoice.product,
                tier: invoice.tier,
                priceUsd: invoice.priceAmount,
                payCurrency: invoice.payCurrency,
                hoursPending,
            });
            if (!result.success) {
                errors++;
                continue;
            }
            remindersSent++;

            try {
                await redisClient.set(dedupeKey, "1", { ex: 86400 * 7 });
            } catch (error) {
                logger.warn("Failed to persist reminder dedupe key", { dedupeKey, error });
            }
        } catch (error) {
            logger.error("Failed to send crypto invoice reminder", error, { invoiceId: invoice.id });
            errors++;
        }
    }

    return { remindersSent, expired, expiredEmailsSent, errors };
}
