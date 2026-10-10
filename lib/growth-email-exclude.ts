/**
 * Addresses that never receive growth emails (drip + power-user upsell), from
 * the optional `GROWTH_EMAIL_EXCLUDE` env var (comma-separated). Read per call
 * so a config change applies without a code change. Normalized to trimmed
 * lowercase, matching how account emails are stored.
 */
export function getGrowthEmailExcludeList(raw: string | undefined = process.env.GROWTH_EMAIL_EXCLUDE): string[] {
    if (!raw) return []
    return Array.from(new Set(
        raw
            .split(",")
            .map((email) => email.trim().toLowerCase())
            .filter((email) => email.length > 0),
    ))
}
