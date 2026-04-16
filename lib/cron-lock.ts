import { redis } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import crypto from "crypto";

const logger = createLogger("CronLock");

/**
 * Run `fn` under a distributed Redis lock keyed on `name`.
 * If the lock is already held, returns `null` without running `fn`.
 * TTL is a safety net in case the worker crashes mid-run.
 *
 * Uses Upstash `SET key value NX EX ttl` — atomic acquire with expiration.
 *
 * If Redis is unavailable (dev without Upstash env vars), runs `fn`
 * unlocked so local development still works.
 */
export async function withCronLock<T>(
  name: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const key = `cron-lock:${name}`;
  const token = `${process.pid}-${Date.now()}-${crypto.randomUUID()}`;

  if (!redis) {
    logger.warn("Redis unavailable, running cron without lock", { name });
    return await fn();
  }

  // SET NX EX — only succeeds if the key does not exist
  let acquired: string | null = null
  try {
    acquired = await redis.set(key, token, { nx: true, ex: ttlSeconds })
  } catch (error) {
    logger.error("Failed to acquire cron lock, running unlocked", error, { name })
    return await fn()
  }

  if (acquired !== "OK") {
    logger.info("Cron lock held by another worker, skipping", { name });
    return null;
  }

  try {
    return await fn();
  } finally {
    // Release only if we still own the token (avoid releasing a re-acquired lock).
    try {
      const current = await redis.get<string>(key);
      if (current === token) {
        await redis.del(key);
      }
    } catch (e) {
      logger.error("Failed to release cron lock", e, { name });
    }
  }
}
