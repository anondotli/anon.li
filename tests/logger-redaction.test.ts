import { describe, it, expect } from "vitest"
import { sanitizeObject } from "@/lib/logger"

/**
 * Tests the logger's sanitization logic by calling sanitizeObject directly.
 * This ensures sensitive data is properly redacted before it reaches any output.
 */

describe("logger redaction", () => {
    describe("sensitive key redaction", () => {
        it("redacts password fields", () => {
            const result = sanitizeObject({ password: "supersecret123", username: "user" }) as Record<string, unknown>
            expect(result.password).toBe("[REDACTED]")
            expect(result.username).toBe("user")
        })

        it("redacts token fields", () => {
            const result = sanitizeObject({ token: "abc123", sessionToken: "xyz789" }) as Record<string, unknown>
            expect(result.token).toBe("[REDACTED]")
            expect(result.sessionToken).toBe("[REDACTED]")
        })

        it("redacts API keys", () => {
            const result = sanitizeObject({ apiKey: "ak_1234567890abcdef", api_key: "test_key" }) as Record<string, unknown>
            expect(result.apiKey).toBe("[REDACTED]")
            expect(result.api_key).toBe("[REDACTED]")
        })

        it("redacts encryption-related fields", () => {
            const result = sanitizeObject({
                encryptionKey: "key123",
                salt: "salt456",
                iv: "iv789",
                totp: "123456",
                totpSecret: "JBSWY3DPEHPK3PXP",
                backupCodes: ["code1", "code2"],
            }) as Record<string, unknown>
            expect(result.encryptionKey).toBe("[REDACTED]")
            expect(result.salt).toBe("[REDACTED]")
            expect(result.iv).toBe("[REDACTED]")
            expect(result.totp).toBe("[REDACTED]")
            expect(result.totpSecret).toBe("[REDACTED]")
            expect(result.backupCodes).toBe("[REDACTED]")
        })

        it("redacts payment identifiers", () => {
            const result = sanitizeObject({
                stripeCustomerId: "cus_abc123",
                stripeSubscriptionId: "sub_xyz789",
            }) as Record<string, unknown>
            expect(result.stripeCustomerId).toBe("[REDACTED]")
            expect(result.stripeSubscriptionId).toBe("[REDACTED]")
        })

        it("redacts fields matching SENSITIVE_PATTERNS (case-insensitive)", () => {
            const result = sanitizeObject({
                myPassword: "secret1",
                bearerAuth: "secret2",
                userCredential: "secret3",
            }) as Record<string, unknown>
            expect(result.myPassword).toBe("[REDACTED]")
            expect(result.bearerAuth).toBe("[REDACTED]")
            expect(result.userCredential).toBe("[REDACTED]")
        })
    })

    describe("string sanitization", () => {
        it("masks email addresses", () => {
            expect(sanitizeObject("user@example.com")).toBe("u***@example.com")
        })

        it("masks single-character local part emails", () => {
            expect(sanitizeObject("a@example.com")).toBe("a***@example.com")
        })

        it("redacts URL query parameters", () => {
            const result = sanitizeObject("https://example.com/api?token=secret123&key=abc")
            expect(result).not.toContain("secret123")
            expect(result).toContain("[REDACTED]")
        })

        it("redacts long base64/hex-like strings", () => {
            const longToken = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdef"
            expect(sanitizeObject(longToken)).toBe("[REDACTED]")
        })

        it("does not redact short non-sensitive strings", () => {
            expect(sanitizeObject("hello")).toBe("hello")
        })

        it("preserves numbers and booleans", () => {
            expect(sanitizeObject(42)).toBe(42)
            expect(sanitizeObject(true)).toBe(true)
        })

        it("preserves null and undefined", () => {
            expect(sanitizeObject(null)).toBeNull()
            expect(sanitizeObject(undefined)).toBeUndefined()
        })
    })

    describe("recursive sanitization", () => {
        it("sanitizes nested objects", () => {
            const result = sanitizeObject({
                user: {
                    name: "test",
                    credentials: {
                        password: "nested_secret",
                    },
                },
            }) as Record<string, unknown>
            const user = result.user as Record<string, unknown>
            // "credentials" matches /credential/i pattern, so the whole key is redacted
            expect(user.credentials).toBe("[REDACTED]")
            expect(user.name).toBe("test")
        })

        it("recurses into non-sensitive nested objects", () => {
            const result = sanitizeObject({
                metadata: {
                    settings: {
                        password: "deep_secret",
                        label: "public",
                    },
                },
            }) as Record<string, unknown>
            const metadata = result.metadata as Record<string, unknown>
            const settings = metadata.settings as Record<string, unknown>
            expect(settings.password).toBe("[REDACTED]")
            expect(settings.label).toBe("public")
        })

        it("handles deeply nested objects without crashing (max depth 10)", () => {
            let deep: Record<string, unknown> = { value: "leaf" }
            for (let i = 0; i < 15; i++) {
                deep = { nested: deep }
            }
            const result = JSON.stringify(sanitizeObject(deep))
            expect(result).toContain("[MAX_DEPTH]")
        })

        it("sanitizes arrays", () => {
            const result = sanitizeObject({
                items: [
                    { password: "secret1" },
                    { password: "secret2" },
                ],
            }) as Record<string, unknown>
            const items = result.items as Record<string, unknown>[]
            expect(items[0]!.password).toBe("[REDACTED]")
            expect(items[1]!.password).toBe("[REDACTED]")
        })
    })
})
