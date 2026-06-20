/**
 * PostHog event redaction — the zero-knowledge guardrail. Runs in posthog-js
 * `before_send` (client) and is reused for server-event properties. Kept free of
 * any posthog import so it can be unit-tested in isolation.
 *
 * Guarantees:
 *  - Events from secret-bearing / internal routes are dropped entirely: Drop
 *    download `/d/*` (the decryption key is in the URL fragment), auth/verify
 *    token routes (`/reset`, `/verify-recipient`, `/2fa`), and `/admin`.
 *  - URL properties never retain a `#fragment`; query strings are filtered to an
 *    attribution allowlist; resource IDs in paths are masked to `[id]`.
 *  - Autocaptured element hrefs are scrubbed the same way (a displayed Drop
 *    share link must not leak its key via autocapture).
 */

export interface PostHogEventLike {
    event?: string
    properties?: Record<string, unknown>
}

// Pages whose URL can carry a secret (Drop key fragment, auth/verify token) or
// are internal-only — never emit ANY event from these.
const DROP_PATH_PREFIXES = ["/d", "/verify-recipient", "/reset", "/2fa", "/admin"]

// Query params worth keeping for attribution; everything else is stripped so a
// stray token/secret in the query string never reaches PostHog.
const QUERY_ALLOWLIST = new Set([
    "utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content",
    "ref", "highlight", "gclid", "fbclid",
])

const URL_PROP_KEYS = ["$current_url", "$referrer", "$initial_current_url", "$initial_referrer"]

function beforeChar(s: string, ch: string): string {
    const i = s.indexOf(ch)
    return i === -1 ? s : s.slice(0, i)
}

function matchesDropPrefix(pathname: string): boolean {
    return DROP_PATH_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`))
}

// Heuristic: random-looking IDs (uuid, or >=12-char base62-ish with a digit) are
// masked; human-readable slugs (blog/docs, all letters/hyphens, no digits) survive.
function looksLikeId(segment: string): boolean {
    if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(segment)) return true
    return (
        segment.length >= 12 &&
        /^[A-Za-z0-9_-]+$/.test(segment) &&
        /[0-9]/.test(segment) &&
        /[A-Za-z]/.test(segment)
    )
}

function maskIds(pathname: string): string {
    return pathname.split("/").map((seg) => (looksLikeId(seg) ? "[id]" : seg)).join("/")
}

function sanitizeUrl(raw: string): string {
    try {
        const u = new URL(raw)
        u.hash = ""
        const kept = new URLSearchParams()
        u.searchParams.forEach((v, k) => {
            if (QUERY_ALLOWLIST.has(k.toLowerCase())) kept.set(k, v)
        })
        u.search = kept.toString()
        u.pathname = maskIds(u.pathname)
        return u.toString()
    } catch {
        // Not a full URL (bare path / referrer) — strip fragment + query manually.
        return maskIds(beforeChar(beforeChar(raw, "#"), "?"))
    }
}

function pathFromProps(props: Record<string, unknown>): string {
    const pathname = props.$pathname
    if (typeof pathname === "string") return pathname
    const url = props.$current_url
    if (typeof url === "string") {
        try {
            return new URL(url).pathname
        } catch {
            return ""
        }
    }
    return ""
}

/**
 * Redact a PostHog event in place. Returns the event, or `null` to drop it.
 */
export function scrubPostHogEvent(event: PostHogEventLike | null): PostHogEventLike | null {
    if (!event || !event.properties) return event
    const props = event.properties

    const pathname = pathFromProps(props)
    if (pathname && matchesDropPrefix(pathname)) return null

    if (typeof props.$pathname === "string") {
        props.$pathname = maskIds(beforeChar(beforeChar(props.$pathname, "#"), "?"))
    }
    for (const key of URL_PROP_KEYS) {
        const val = props[key]
        if (typeof val === "string" && val) props[key] = sanitizeUrl(val)
    }

    const elements = props.$elements
    if (Array.isArray(elements)) {
        for (const el of elements) {
            if (el && typeof el === "object") {
                const e = el as Record<string, unknown>
                if (typeof e.href === "string") e.href = sanitizeUrl(e.href)
                if (typeof e.attr__href === "string") e.attr__href = sanitizeUrl(e.attr__href)
            }
        }
    }
    if (typeof props.$elements_chain === "string") {
        props.$elements_chain = props.$elements_chain.replace(/#[^"'\s)]+/g, "#[redacted]")
    }

    return event
}
