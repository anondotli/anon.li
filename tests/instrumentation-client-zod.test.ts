import { describe, expect, it, vi } from "vitest"

vi.mock("posthog-js", () => ({ default: { init: vi.fn() } }))

describe("instrumentation-client", () => {
    it("runs Zod jitless so no eval probe trips the CSP", async () => {
        await import("@/instrumentation-client")
        // Forms import the classic `zod` entry; it must share the core config.
        const { z } = await import("zod")
        expect(z.config().jitless).toBe(true)
    })
})
