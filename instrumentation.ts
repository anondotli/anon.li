import { validateServerEnv, validateClientEnv } from "@/lib/env"

export async function register() {
    if (process.env.NEXT_RUNTIME === 'nodejs') {
        validateServerEnv()
        // Server-side PostHog (error tracking + server events). Dynamically
        // imported inside the nodejs guard so posthog-node and the server-only
        // sink never enter the edge/client module graph. No-op unless
        // NEXT_PUBLIC_POSTHOG_KEY is set.
        const { initPostHogServer } = await import("@/lib/posthog.server")
        initPostHogServer()
    }
    validateClientEnv()
}
