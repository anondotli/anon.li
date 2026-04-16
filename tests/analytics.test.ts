import { beforeEach, describe, expect, it, vi } from "vitest"

import { analytics } from "@/lib/analytics"

describe("analytics payloads", () => {
    const track = vi.fn()

    beforeEach(() => {
        track.mockReset()
        ;(globalThis as { window?: { umami?: { track: typeof track } } }).window = {
            umami: { track },
        }
    })

    it("omits identifiers from sensitive events", () => {
        analytics.dropUploadCompleted()
        analytics.aliasDomainConnected()

        expect(track).toHaveBeenNthCalledWith(1, "drop_upload_completed")
        expect(track).toHaveBeenNthCalledWith(2, "alias_domain_connected")
    })

    it("keeps aggregate payloads for non-identifying events", () => {
        analytics.dropUploadStarted(3)

        expect(track).toHaveBeenCalledWith("drop_upload_started", { file_count: 3 })
    })
})
