import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createLogger } from "@/lib/logger"

describe("logger redaction", () => {
    let infoSpy: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        infoSpy = vi.spyOn(console, "info").mockImplementation(() => {})
    })

    afterEach(() => {
        vi.restoreAllMocks()
    })

    function lastInfoMessage() {
        const call = infoSpy.mock.calls.at(-1)
        if (!call) throw new Error("console.info was not called")
        return String(call[0])
    }

    it("redacts sensitive keys before logging", () => {
        createLogger("test").info("created", {
            password: "supersecret123",
            token: "abc123",
            sessionToken: "xyz789",
            apiKey: "ak_1234567890abcdef",
            encryptionKey: "key123",
            stripeCustomerId: "cus_abc123",
            username: "user",
        })

        const output = lastInfoMessage()
        expect(output).toContain("[REDACTED]")
        expect(output).toContain('"username":"user"')
        expect(output).not.toContain("supersecret123")
        expect(output).not.toContain("abc123")
        expect(output).not.toContain("ak_1234567890abcdef")
        expect(output).not.toContain("cus_abc123")
    })

    it("sanitizes nested values, emails, URL params, and token-like strings", () => {
        createLogger("test").info("nested", {
            metadata: {
                email: "user@example.com",
                callback: "https://example.com/api?token=secret123&key=abc",
                opaque: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef",
            },
        })

        const output = lastInfoMessage()
        expect(output).toContain("u***@example.com")
        expect(output).toContain("token=[REDACTED]")
        expect(output).toContain("key=[REDACTED]")
        expect(output).not.toContain("secret123")
        expect(output).not.toContain("ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef")
    })

    it("limits recursive sanitization depth", () => {
        let deep: Record<string, unknown> = { value: "leaf" }
        for (let i = 0; i < 15; i++) {
            deep = { nested: deep }
        }

        createLogger("test").info("deep", deep)

        expect(lastInfoMessage()).toContain("[MAX_DEPTH]")
    })
})
