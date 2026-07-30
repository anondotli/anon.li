/**
 * @vitest-environment node
 *
 * WS1 instrumentation: the shared server-side event helpers that every new
 * call site uses (captureServerEvent timestamp passthrough, trackServerEvent
 * capture+flush with a fallback for non-request scopes).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const postHog = vi.hoisted(() => ({
    capture: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
}))
const afterMock = vi.hoisted(() => vi.fn())

vi.mock("posthog-node", () => ({
    PostHog: class MockPostHog {
        capture = postHog.capture
        captureException = postHog.captureException
        flush = postHog.flush
    },
}))
vi.mock("next/server", () => ({
    after: afterMock,
}))

import { captureServerEvent, trackServerEvent } from "@/lib/posthog.server"

describe("server-side event helpers", () => {
    const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

    beforeEach(() => {
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
        postHog.capture.mockClear()
        postHog.flush.mockClear()
        afterMock.mockReset()
        afterMock.mockImplementation((cb: () => Promise<void>) => cb())
    })

    afterEach(() => {
        if (originalKey === undefined) delete process.env.NEXT_PUBLIC_POSTHOG_KEY
        else process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey
    })

    it("forwards event name and sanitized properties", () => {
        captureServerEvent("user-1", "checkout_started", { product: "bundle", tier: "plus" })

        expect(postHog.capture).toHaveBeenCalledWith(expect.objectContaining({
            distinctId: "user-1",
            event: "checkout_started",
            properties: expect.objectContaining({ product: "bundle", tier: "plus" }),
        }))
    })

    it("passes through an explicit timestamp for backfills", () => {
        const when = new Date("2026-01-02T03:04:05.000Z")
        captureServerEvent("user-1", "user_signed_up", { backfill: true }, when)

        expect(postHog.capture).toHaveBeenCalledWith(expect.objectContaining({ timestamp: when }))
    })

    it("omits timestamp for live events", () => {
        captureServerEvent("user-1", "form_created", {})

        const payload = postHog.capture.mock.calls[0]![0] as Record<string, unknown>
        expect("timestamp" in payload).toBe(false)
    })

    it("trackServerEvent captures and schedules a flush via after()", () => {
        trackServerEvent("user-1", "team_created", { team_id: "org-1" })

        expect(postHog.capture).toHaveBeenCalledWith(expect.objectContaining({ event: "team_created" }))
        expect(afterMock).toHaveBeenCalledTimes(1)
        expect(postHog.flush).toHaveBeenCalled()
    })

    it("trackServerEvent falls back to a fire-and-forget flush when after() is unavailable", async () => {
        afterMock.mockImplementation(() => {
            throw new Error("after() called outside of a request")
        })

        trackServerEvent("user-1", "seat_added", { team_id: "org-1" })

        expect(postHog.capture).toHaveBeenCalledTimes(1)
        await vi.waitFor(() => expect(postHog.flush).toHaveBeenCalled())
    })
})
