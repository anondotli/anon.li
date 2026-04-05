import crypto from "crypto";

/**
 * Validate a cron request using scoped secrets derived from CRON_SECRET.
 *
 * Each cron endpoint has its own derived secret:
 *   derivedSecret = HMAC-SHA256(CRON_SECRET, "cron:<scope>")
 *
 * The caller must send either:
 *   - The scope-specific derived secret (preferred), or
 *   - The base CRON_SECRET (accepted for backward compatibility)
 *
 * Scope examples: "cleanup", "domains", "billing"
 */
export function validateCronAuth(req: Request, scope: string): boolean {
    const authHeader = req.headers.get("authorization");
    const secret = process.env.CRON_SECRET;
    if (!secret) return false;

    const providedToken = authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : "";
    if (!providedToken) return false;

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

    // Fall back to base CRON_SECRET for backward compatibility
    const baseHash = crypto.createHash("sha256").update(secret).digest();
    return crypto.timingSafeEqual(providedHash, baseHash);
}
