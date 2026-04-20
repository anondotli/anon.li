import crypto from "crypto";

/**
 * One-click email unsubscribe tokens.
 *
 * Format: `${userId}.${hmac}` where hmac = HMAC-SHA256(AUTH_SECRET, `unsub:${userId}`)
 * base64url-encoded, truncated to 32 chars. Tokens never expire — unsubscribing
 * is idempotent, and the flag on the user row is the source of truth.
 *
 * AUTH_SECRET is already required at startup (lib/env.ts), so verification will
 * always succeed in production. In tests we fall back to a deterministic stub.
 */

const HMAC_SCOPE = "unsub";
const HMAC_LENGTH = 32;

function getSecret(): string {
    return process.env.AUTH_SECRET || "test-secret-do-not-use-in-prod";
}

function hmac(userId: string): string {
    return crypto
        .createHmac("sha256", getSecret())
        .update(`${HMAC_SCOPE}:${userId}`)
        .digest("base64url")
        .slice(0, HMAC_LENGTH);
}

export function signUnsubscribeToken(userId: string): string {
    return `${userId}.${hmac(userId)}`;
}

export function verifyUnsubscribeToken(token: string): string | null {
    const dot = token.lastIndexOf(".");
    if (dot <= 0 || dot === token.length - 1) return null;

    const userId = token.slice(0, dot);
    const providedMac = token.slice(dot + 1);
    const expectedMac = hmac(userId);

    if (providedMac.length !== expectedMac.length) return null;

    const provided = Buffer.from(providedMac);
    const expected = Buffer.from(expectedMac);
    if (!crypto.timingSafeEqual(provided, expected)) return null;

    return userId;
}

export function unsubscribeUrl(userId: string): string {
    const base = process.env.NEXT_PUBLIC_APP_URL || "https://anon.li";
    const token = signUnsubscribeToken(userId);
    return `${base}/api/email/unsubscribe?token=${encodeURIComponent(token)}`;
}
