import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createLogger, sanitizeError } from "@/lib/logger"

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

    it("redacts embedded credentials from error messages and stacks", () => {
        const error = new Error(
            "Request failed for user@example.com with Bearer bearer-secret " +
            "at postgresql://db-user:db-password@db.example.com/app?token=query-secret",
        )
        error.stack = `${error.name}: ${error.message}\n` +
            "    at request (https://api.example.com/run?access_token=stack-secret)"

        const sanitized = sanitizeError(error, true)
        const output = `${sanitized.message}\n${sanitized.stack}`

        expect(output).toContain("u***@example.com")
        expect(output).toContain("Bearer [REDACTED]")
        expect(output).toContain("[REDACTED]:[REDACTED]@db.example.com")
        expect(output).not.toContain("bearer-secret")
        expect(output).not.toContain("db-password")
        expect(output).not.toContain("query-secret")
        expect(output).not.toContain("stack-secret")
        expect(output).not.toContain("user@example.com")
    })

    it("sanitizes secrets interpolated directly into log messages", () => {
        const logger = createLogger("MessageRedaction")
        logger.info("Login failed for user@example.com with Bearer live-secret")

        const output = lastInfoMessage()
        expect(output).toContain("u***@example.com")
        expect(output).toContain("Bearer [REDACTED]")
        expect(output).not.toContain("user@example.com")
        expect(output).not.toContain("live-secret")
    })
})
