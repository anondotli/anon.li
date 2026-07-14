import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const postHog = vi.hoisted(() => ({
    capture: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("posthog-node", () => ({
    PostHog: class MockPostHog {
        capture = postHog.capture
        captureException = postHog.captureException
        flush = postHog.flush
    },
}))

import { createLogger, setErrorSink } from "@/lib/logger"
import { initPostHogServer } from "@/lib/posthog.server"

describe("PostHog server redaction", () => {
    const originalKey = process.env.NEXT_PUBLIC_POSTHOG_KEY

    beforeEach(() => {
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
        postHog.captureException.mockClear()
        setErrorSink(null)
    })

    afterEach(() => {
        setErrorSink(null)
        if (originalKey === undefined) {
            delete process.env.NEXT_PUBLIC_POSTHOG_KEY
        } else {
            process.env.NEXT_PUBLIC_POSTHOG_KEY = originalKey
        }
    })

    it("never sends raw secrets from exception messages, stacks, or properties", () => {
        const error = new Error(
            "Database request failed for owner@example.com using Bearer bearer-secret " +
            "at postgresql://db-user:db-password@db.example.com/app?token=query-secret",
        )
        error.name = "RemoteError token=name-secret"
        error.stack = `${error.name}: ${error.message}\n` +
            "    at request (https://api.example.com/run?access_token=stack-secret)"

        initPostHogServer()
        createLogger("billing").error(
            "Charge failed for billing@example.com; token=message-secret",
            error,
            {
                detail: "Authorization: Bearer property-secret",
                database: "postgresql://property-user:property-password@db.example.com/app",
                owner: "owner@example.com",
            },
        )

        expect(postHog.captureException).toHaveBeenCalledTimes(1)
        const [safeError, distinctId, properties] = postHog.captureException.mock.calls[0]!
        expect(safeError).toBeInstanceOf(Error)
        expect(distinctId).toBe("server")

        const payload = JSON.stringify({
            name: (safeError as Error).name,
            message: (safeError as Error).message,
            stack: (safeError as Error).stack,
            properties,
        })

        expect(payload).toContain("[REDACTED]")
        expect(payload).toContain("o***@example.com")
        for (const secret of [
            "bearer-secret",
            "db-password",
            "query-secret",
            "name-secret",
            "stack-secret",
            "message-secret",
            "property-secret",
            "property-password",
            "owner@example.com",
            "billing@example.com",
        ]) {
            expect(payload).not.toContain(secret)
        }
    })
})
