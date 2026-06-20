import posthog from "posthog-js"
import { scrubPostHogEvent } from "@/lib/posthog-scrub"

// Client-side PostHog init (Next.js instrumentation-client runs before hydration).
// Balanced + privacy config for a privacy product: autocapture on, but NO session
// replay, NO cookies (localStorage), pseudonymous identity, EU region via a
// first-party reverse proxy (/ingest). before_send is the zero-knowledge guardrail
// (see lib/posthog-scrub): URL fragments — which carry Drop decryption keys — are
// stripped and events on key/token-bearing routes are dropped entirely.
// No-op unless NEXT_PUBLIC_POSTHOG_KEY is set.
const key = process.env.NEXT_PUBLIC_POSTHOG_KEY

if (key) {
    posthog.init(key, {
        api_host: process.env.NEXT_PUBLIC_POSTHOG_HOST || "/ingest",
        ui_host: "https://eu.posthog.com",
        defaults: "2026-01-30",
        persistence: "localStorage",
        person_profiles: "identified_only",
        autocapture: true,
        disable_session_recording: true,
        respect_dnt: true,
        before_send: (cr) => scrubPostHogEvent(cr) as typeof cr,
    })
}
