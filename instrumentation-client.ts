import posthog from "posthog-js"
import { config as zodConfig } from "zod/v4/core"
import { scrubPostHogEvent } from "@/lib/posthog-scrub"

// Zod 4 probes `new Function("")` the first time it parses an object schema to
// decide whether to JIT-compile it. The probe's throw is caught, but our CSPs
// (no 'unsafe-eval') still log a script-src violation on every page with a
// client-side Zod form. jitless skips the probe; client schemas are tiny.
zodConfig({ jitless: true })

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
        // Autocapture must never record what is on screen: alias/recipient
        // addresses appear in element text AND in attributes (aria-label,
        // title, value), so both are masked globally. Rows that render
        // personal data additionally opt out with `ph-no-capture`.
        mask_all_text: true,
        mask_all_element_attributes: true,
        disable_session_recording: true,
        respect_dnt: true,
        before_send: (cr) => scrubPostHogEvent(cr) as typeof cr,
    })
}
