import { redis } from "@/lib/rate-limit";
import { createLogger } from "@/lib/logger";
import crypto from "crypto";

const logger = createLogger("CronLock");

const RELEASE_IF_OWNER_SCRIPT = `
if redis.call("get", KEYS[1]) == ARGV[1] then
  return redis.call("del", KEYS[1])
end
return 0
`;

/**
 * Run `fn` under a distributed Redis lock keyed on `name`.
 * If the lock is already held, returns `null` without running `fn`.
 * TTL is a safety net in case the worker crashes mid-run.
 *
 * Uses Upstash `SET key value NX EX ttl` — atomic acquire with expiration.
 */
export async function withCronLock<T>(
  name: string,
  ttlSeconds: number,
  fn: () => Promise<T>
): Promise<T | null> {
  const key = `cron-lock:${name}`;
  const token = `${process.pid}-${Date.now()}-${crypto.randomUUID()}`;

  // SET NX EX — only succeeds if the key does not exist
  let acquired: string | null = null
  try {
    acquired = await redis.set(key, token, { nx: true, ex: ttlSeconds })
  } catch (error) {
    // These jobs delete data and reconcile billing. If mutual exclusion cannot
    // be established, surface a failed cron run so the scheduler can retry and
    // monitoring can alert; never execute destructive work unlocked.
    logger.error("Failed to acquire cron lock; refusing to run unlocked", error, { name })
    throw error
  }

  if (acquired !== "OK") {
    logger.info("Cron lock held by another worker, skipping", { name });
    return null;
  }

  try {
    return await fn();
  } finally {
    // Compare-and-delete atomically. A GET followed by DEL has a race where the
    // TTL can expire and a new worker can acquire the key between those calls.
    try {
      await redis.eval(RELEASE_IF_OWNER_SCRIPT, [key], [token]);
    } catch (e) {
      logger.error("Failed to release cron lock", e, { name });
    }
  }
}
