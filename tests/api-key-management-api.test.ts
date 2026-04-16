/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()
const getAuthUserState = vi.fn()
const createWithMetadata = vi.fn()
const validateCsrf = vi.fn()

vi.mock("@/auth", () => ({ auth }))

vi.mock("@/lib/data/auth", () => ({
    getAuthUserState,
    getAuthApiKeyRecord: vi.fn().mockResolvedValue(null),
    touchApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/services/api-key", () => ({
    ApiKeyService: {
        createWithMetadata,
        hashKey: vi.fn(),
    },
}))

vi.mock("@/lib/data/api-key", () => ({
    getApiKeysByUserId: vi.fn(),
}))

vi.mock("@/lib/csrf", () => ({
    validateCsrf,
}))

describe("API key management API", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        auth.mockResolvedValue(null)
    })

    it("does not let an API key create another API key", async () => {
        const { POST } = await import("@/app/api/v1/api-key/route")

        const response = await POST(new Request("http://localhost/api/v1/api-key", {
            method: "POST",
            headers: {
                authorization: "Bearer ak_existing",
                "content-type": "application/json",
            },
            body: JSON.stringify({ label: "nested key" }),
        }))

        expect(response.status).toBe(401)
        expect(createWithMetadata).not.toHaveBeenCalled()
    })

    it("allows a verified session to create an API key with a validated label", async () => {
        auth.mockResolvedValue({
            user: { id: "user-123", twoFactorEnabled: true },
            twoFactorVerified: true,
        })
        getAuthUserState.mockResolvedValue({ id: "user-123", banned: false })
        createWithMetadata.mockResolvedValue({
            id: "key-123",
            key: "ak_created",
            keyPrefix: "ak_created",
            label: "CI",
            createdAt: new Date("2026-04-16T00:00:00.000Z"),
            expiresAt: null,
        })

        const request = new Request("http://localhost/api/v1/api-key", {
            method: "POST",
            headers: {
                origin: "http://localhost",
                "content-type": "application/json",
            },
            body: JSON.stringify({ label: " CI " }),
        })
        const { POST } = await import("@/app/api/v1/api-key/route")

        const response = await POST(request)

        expect(response.status).toBe(201)
        expect(validateCsrf).toHaveBeenCalledWith(request)
        expect(createWithMetadata).toHaveBeenCalledWith("user-123", "CI", undefined)
    })
})
