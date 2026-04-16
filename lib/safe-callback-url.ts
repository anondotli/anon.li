const DEFAULT_AUTH_CALLBACK_URL = "/dashboard/alias"
const SAFE_CALLBACK_PREFIX = "/dashboard"

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
    if (!input.startsWith("/") || input.startsWith("//")) {
        return null
    }

    if (!(input === SAFE_CALLBACK_PREFIX || input.startsWith(`${SAFE_CALLBACK_PREFIX}/`))) {
        return null
    }

    return input
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

export function buildSetupPasswordUrl(callbackUrl?: string | null): string {
    const safeCallbackUrl = sanitizeAuthCallbackUrl(callbackUrl)
    if (safeCallbackUrl === DEFAULT_AUTH_CALLBACK_URL) {
        return "/setup"
    }

    return `/setup?callbackUrl=${encodeURIComponent(safeCallbackUrl)}`
}
