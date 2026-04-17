/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiError, ErrorCodes } from "@/lib/api-response"

const auth = vi.fn()
const validateApiKey = vi.fn()
const hasExplicitApiKey = vi.fn()
const rateLimit = vi.fn()
const getVaultSchemaState = vi.fn()
const verifyCredentialSecret = vi.fn()

const prisma = {
    userSecurity: {
        findUnique: vi.fn(),
    },
}

vi.mock("@/auth", () => ({
    auth,
}))

vi.mock("@/lib/api-auth", () => ({
    validateApiKey,
    hasExplicitApiKey,
}))

vi.mock("@/lib/api-rate-limit", () => ({
    createRateLimitHeaders: () => new Headers(),
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit,
    rateLimiters: {},
}))

vi.mock("@/lib/prisma", () => ({
    prisma,
}))

vi.mock("@/lib/vault/schema", () => ({
    getVaultSchemaState,
    VAULT_SCHEMA_UNAVAILABLE_MESSAGE: "Vault schema unavailable",
}))

vi.mock("@/lib/vault/server", () => ({
    verifyCredentialSecret,
}))

vi.mock("@/lib/data/auth", () => ({
    getAuthUserState: vi.fn(),
}))

async function readJson(response: Response) {
    return response.json() as Promise<{
        data?: Record<string, unknown>
        error?: { code?: string; message?: string }
    }>
}

describe("POST /api/v1/vault/unlock", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        auth.mockResolvedValue(null)
        hasExplicitApiKey.mockReturnValue(true)
        validateApiKey.mockResolvedValue({
            user: {
                id: "user-123",
                stripeSubscriptionId: null,
                stripePriceId: null,
                stripeCurrentPeriodEnd: null,
            },
            apiKeyId: "key-123",
            rateLimit: {
                success: true,
                limit: 100,
                remaining: 99,
                reset: new Date("2026-04-17T00:00:00.000Z"),
            },
        })
        rateLimit.mockResolvedValue(null)
        getVaultSchemaState.mockResolvedValue({ userSecurity: true, dropOwnerKeys: true })
        verifyCredentialSecret.mockResolvedValue(true)
        prisma.userSecurity.findUnique.mockResolvedValue({
            id: "cmau000000000000000000001",
            vaultSalt: "v".repeat(43),
            passwordWrappedVaultKey: "w".repeat(64),
            vaultGeneration: 2,
            kdfVersion: 1,
        })
    })

    it("returns no-store wrapped vault materials for a valid API key and auth secret", async () => {
        const { POST } = await import("@/app/api/v1/vault/unlock/route")

        const response = await POST(new Request("http://localhost/api/v1/vault/unlock", {
            method: "POST",
            headers: { Authorization: "Bearer ak_test" },
            body: JSON.stringify({ auth_secret: "a".repeat(32) }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(200)
        expect(response.headers.get("Cache-Control")).toContain("no-store")
        expect(verifyCredentialSecret).toHaveBeenCalledWith("user-123", "a".repeat(32))
        expect(payload.data).toEqual({
            vault_id: "cmau000000000000000000001",
            vault_generation: 2,
            vault_salt: "v".repeat(43),
            password_wrapped_vault_key: "w".repeat(64),
            kdf_version: 1,
        })
    })

    it("rejects an incorrect auth secret without exposing vault materials", async () => {
        verifyCredentialSecret.mockResolvedValueOnce(false)
        const { POST } = await import("@/app/api/v1/vault/unlock/route")

        const response = await POST(new Request("http://localhost/api/v1/vault/unlock", {
            method: "POST",
            body: JSON.stringify({ auth_secret: "a".repeat(32) }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(401)
        expect(payload.error?.code).toBe(ErrorCodes.UNAUTHORIZED)
        expect(payload.data).toBeUndefined()
    })

    it("returns not found when vault security is not configured", async () => {
        prisma.userSecurity.findUnique.mockResolvedValueOnce(null)
        const { POST } = await import("@/app/api/v1/vault/unlock/route")

        const response = await POST(new Request("http://localhost/api/v1/vault/unlock", {
            method: "POST",
            body: JSON.stringify({ auth_secret: "a".repeat(32) }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(404)
        expect(payload.error?.code).toBe(ErrorCodes.NOT_FOUND)
    })

    it("returns service unavailable when the vault schema is missing", async () => {
        getVaultSchemaState.mockResolvedValueOnce({ userSecurity: false, dropOwnerKeys: false })
        const { POST } = await import("@/app/api/v1/vault/unlock/route")

        const response = await POST(new Request("http://localhost/api/v1/vault/unlock", {
            method: "POST",
            body: JSON.stringify({ auth_secret: "a".repeat(32) }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(503)
        expect(payload.error?.code).toBe(ErrorCodes.SERVICE_UNAVAILABLE)
    })

    it("surfaces rate limits before checking the vault password", async () => {
        rateLimit.mockResolvedValueOnce(apiError("Too many requests", ErrorCodes.RATE_LIMITED, "req-rate", 429))
        const { POST } = await import("@/app/api/v1/vault/unlock/route")

        const response = await POST(new Request("http://localhost/api/v1/vault/unlock", {
            method: "POST",
            body: JSON.stringify({ auth_secret: "a".repeat(32) }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(429)
        expect(payload.error?.code).toBe(ErrorCodes.RATE_LIMITED)
        expect(verifyCredentialSecret).not.toHaveBeenCalled()
    })
})
