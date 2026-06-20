import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

// Inline factory (no top-level variable) to avoid vi.mock hoisting issues with
// Bun's runner; the mock fn is retrieved from the mocked module below.
vi.mock("posthog-js", () => ({ default: { capture: vi.fn() } }))

import posthog from "posthog-js"
import { analytics } from "@/lib/analytics"

const capture = posthog.capture as unknown as Mock

describe("analytics payloads", () => {
    beforeEach(() => {
        capture.mockReset()
        if (typeof window === "undefined") {
            ;(globalThis as { window?: object }).window = {} as object
        }
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
    })

    it("omits identifiers from sensitive events", () => {
        analytics.dropUploadCompleted()
        analytics.aliasDomainConnected()

        expect(capture).toHaveBeenNthCalledWith(1, "drop_upload_completed", undefined)
        expect(capture).toHaveBeenNthCalledWith(2, "alias_domain_connected", undefined)
    })

    it("keeps aggregate payloads for non-identifying events", () => {
        analytics.dropUploadStarted(3)

        expect(capture).toHaveBeenCalledWith("drop_upload_started", { file_count: 3 })
    })

    it("forwards billing funnel events with their dimensions", () => {
        analytics.checkoutStarted("bundle", "plus", "monthly")
        analytics.checkoutCompleted("card")

        expect(capture).toHaveBeenNthCalledWith(1, "checkout_started", { product: "bundle", tier: "plus", frequency: "monthly" })
        expect(capture).toHaveBeenNthCalledWith(2, "checkout_completed", { method: "card" })
    })
})
