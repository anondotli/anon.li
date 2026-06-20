import "server-only"
import { PostHog } from "posthog-node"
import { sanitizeObject, sanitizeString, setErrorSink } from "@/lib/logger"

// Server-side PostHog: error tracking (via the logger sink) + authoritative,
// ad-blocker-proof server events (e.g. subscription_activated). Singleton reused
// across warm invocations; flushAt:1/flushInterval:0 sends immediately (correct
// for serverless). Never shutdown() the singleton — flush via after() instead.
let client: PostHog | null = null

function getClient(): PostHog | null {
    if (client) return client
    const key = process.env.NEXT_PUBLIC_POSTHOG_KEY
    if (!key) return null
    client = new PostHog(key, {
        host: process.env.POSTHOG_HOST || "https://eu.i.posthog.com",
        flushAt: 1,
        flushInterval: 0,
    })
    return client
}

/**
 * Capture a server-side event. Best-effort; never throws into callers.
 * Properties are sanitized with the logger's redaction before sending.
 */
export function captureServerEvent(
    distinctId: string,
    event: string,
    properties?: Record<string, unknown>,
): void {
    const ph = getClient()
    if (!ph) return
    try {
        ph.capture({
            distinctId,
            event,
            properties: sanitizeObject(properties ?? {}) as Record<string, unknown>,
        })
    } catch {
        // telemetry must never break the request
    }
}

/** Flush pending events (call from after() so the response isn't blocked). */
export async function flushPostHog(): Promise<void> {
    if (!client) return
    try {
        await client.flush()
    } catch {
        // ignore
    }
}

/**
 * Register the logger error sink so every logger.error(...) becomes a PostHog
 * $exception — with a redacted message (server stacks never contain the Drop key)
 * and sanitized context. Called once from instrumentation.ts. No-op without a key.
 */
export function initPostHogServer(): void {
    const ph = getClient()
    if (!ph) return

    setErrorSink((context, message, error, data) => {
        const raw = error instanceof Error ? error : new Error(message)
        const safe = new Error(sanitizeString(raw.message))
        safe.name = raw.name
        safe.stack = raw.stack
        const props = sanitizeObject({ logger_context: context, message, data }) as Record<string, unknown>
        try {
            ph.captureException(safe, "server", props)
        } catch {
            // never break logging
        }
    })
}
