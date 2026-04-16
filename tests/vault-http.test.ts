/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const rateLimit = vi.fn()
const validateCsrf = vi.fn()

vi.mock("@/lib/rate-limit", () => ({
    rateLimit,
    rateLimiters: {},
}))

vi.mock("@/lib/csrf", () => ({
    validateCsrf,
}))

describe("enforceVaultRequestGuards", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        rateLimit.mockResolvedValue(null)
    })

    it("uses vaultOps by default", async () => {
        const { enforceVaultRequestGuards } = await import("@/lib/vault/http")

        const result = await enforceVaultRequestGuards({
            requestId: "req-1",
            identifier: "user-123",
        })

        expect(result).toBeNull()
        expect(rateLimit).toHaveBeenCalledWith("vaultOps", "user-123")
    })

    it("supports a dedicated limiter override", async () => {
        const { enforceVaultRequestGuards } = await import("@/lib/vault/http")

        const result = await enforceVaultRequestGuards({
            requestId: "req-1",
            identifier: "user-123",
            rateLimitKey: "vaultDropKeysRead",
        })

        expect(result).toBeNull()
        expect(rateLimit).toHaveBeenCalledWith("vaultDropKeysRead", "user-123")
    })
})
