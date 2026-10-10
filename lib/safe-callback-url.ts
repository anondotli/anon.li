const DEFAULT_AUTH_CALLBACK_URL = "/dashboard/alias"
const SAFE_CALLBACK_PREFIX = "/dashboard"
// Base used only to resolve dot-segments / encodings; never part of the output.
const RESOLUTION_BASE = "https://callback.invalid"

/**
 * Same-origin paths a post-login redirect may land on: the dashboard, an org
 * invitation (`/accept-invitation/<id>`) and the OAuth consent screen — the
 * last two bounce through /login when signed out and must come back.
 */
function isAllowedCallbackPath(pathname: string): boolean {
    return pathname === SAFE_CALLBACK_PREFIX
        || pathname.startsWith(`${SAFE_CALLBACK_PREFIX}/`)
        || /^\/accept-invitation\/[A-Za-z0-9_-]+$/.test(pathname)
        || pathname === "/oauth/consent"
}

function getAllowedOrigins(): string[] {
    const origins = new Set<string>()

    if (typeof window !== "undefined" && window.location.origin) {
        origins.add(window.location.origin)
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL
    if (appUrl) {
        try {
            origins.add(new URL(appUrl).origin)
        } catch {
            // Ignore invalid env values and fall back to relative-path validation.
        }
    }

    return Array.from(origins)
}

function normalizeRelativeCallbackPath(input: string): string | null {
    if (!input.startsWith("/") || input.startsWith("//") || input.includes("\\")) {
        return null
    }

    // Judge the path the browser will actually navigate to, so dot-segments
    // (`/dashboard/../admin`) can't smuggle a disallowed path past the prefix.
    let resolved: URL
    try {
        resolved = new URL(input, RESOLUTION_BASE)
    } catch {
        return null
    }
    if (resolved.origin !== RESOLUTION_BASE || !isAllowedCallbackPath(resolved.pathname)) {
        return null
    }

    // Return the parsed form, not the raw input: the URL parser strips tab/CR/LF
    // and percent-encodes what it must, so the result is always a valid
    // Location header value and is exactly the path that was validated.
    return `${resolved.pathname}${resolved.search}${resolved.hash}`
}

export function sanitizeAuthCallbackUrl(
    input: string | null | undefined,
    fallback = DEFAULT_AUTH_CALLBACK_URL,
): string {
    if (!input) {
        return fallback
    }

    const relativePath = normalizeRelativeCallbackPath(input)
    if (relativePath) {
        return relativePath
    }

    for (const origin of getAllowedOrigins()) {
        try {
            const parsed = new URL(input, origin)
            if (parsed.origin !== origin) {
                continue
            }

            const normalized = normalizeRelativeCallbackPath(`${parsed.pathname}${parsed.search}${parsed.hash}`)
            if (normalized) {
                return normalized
            }
        } catch {
            // Try the next origin or fall back below.
        }
    }

    return fallback
}

