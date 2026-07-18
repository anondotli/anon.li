import crypto from "crypto";

/**
 * Validate a cron request using scoped secrets derived from CRON_SECRET.
 *
 * Each cron endpoint has its own derived secret:
 *   derivedSecret = HMAC-SHA256(CRON_SECRET, "cron:<scope>")
 *
 * Vercel sends the base CRON_SECRET automatically. Operators may also use a
 * scope-specific derived token for manual runs without exposing the base secret.
 *
 * Scope examples: "cleanup", "domains", "billing"
 */
export function validateCronAuth(req: Request, scope: string): boolean {
    const authHeader = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;

    const providedToken = authHeader?.startsWith("Bearer ")
        ? authHeader.slice("Bearer ".length)
        : "";
    if (!providedToken) return false;

    // Reject whitespace and extra authentication parameters instead of silently
    // accepting the first token from a malformed header.
    if (/\s/.test(providedToken)) return false;

    const providedHash = crypto.createHash("sha256").update(providedToken).digest();

    // Check scope-specific derived secret first
    const derivedSecret = crypto
        .createHmac("sha256", secret)
        .update(`cron:${scope}`)
        .digest("hex");
    const derivedHash = crypto.createHash("sha256").update(derivedSecret).digest();

    if (crypto.timingSafeEqual(providedHash, derivedHash)) {
        return true;
    }

    // Vercel-managed cron invocations use the base CRON_SECRET.
    const baseHash = crypto.createHash("sha256").update(secret).digest();
    return crypto.timingSafeEqual(providedHash, baseHash);
}
