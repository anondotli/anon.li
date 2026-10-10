/**
 * @vitest-environment node
 *
 * Team API keys require a paid team. The REST create route enforces this with
 * `organizationAccess: "subscribed"`; the dashboard server action reaches the
 * same service without that policy, so the service itself must enforce it.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { createApiKeyRecord, getUserById, isOrgSubscribed } = vi.hoisted(() => ({
    createApiKeyRecord: vi.fn(),
    getUserById: vi.fn(),
    isOrgSubscribed: vi.fn(),
}))

vi.mock("@/lib/data/api-key", () => ({
    createApiKeyRecord,
    getApiKeyById: vi.fn(),
    deleteApiKeyById: vi.fn(),
}))
vi.mock("@/lib/data/user", () => ({ getUserById }))
vi.mock("@/lib/data/auth", () => ({ isOrgSubscribed }))

import { ApiKeyService } from "@/lib/services/api-key"
import { orgScope, personalScope } from "@/lib/ownership"
import { ApiError } from "@/lib/api-error-utils"

beforeEach(() => {
    vi.clearAllMocks()
    getUserById.mockResolvedValue({ id: "u1", subscriptions: [] })
    createApiKeyRecord.mockImplementation(async (data: { organizationId: string | null; label: string }) => ({
        id: "key_1",
        keyPrefix: "ak_12345678",
        label: data.label,
        createdAt: new Date(),
        expiresAt: null,
    }))
})

describe("ApiKeyService.create — paid-team gate", () => {
    it("rejects a team key while the team has no active subscription", async () => {
        isOrgSubscribed.mockResolvedValue(false)

        const error = await ApiKeyService.create(orgScope("u1", "org_1", "owner"), "CI").catch((e: unknown) => e)

        expect(error).toBeInstanceOf(ApiError)
        expect((error as ApiError).statusCode).toBe(402)
        expect(isOrgSubscribed).toHaveBeenCalledWith("org_1")
        expect(createApiKeyRecord).not.toHaveBeenCalled()
    })

    it("creates a team-owned key for a subscribed team", async () => {
        isOrgSubscribed.mockResolvedValue(true)

        const key = await ApiKeyService.create(orgScope("u1", "org_1", "member"), "CI")

        expect(key).toMatch(/^ak_/)
        expect(createApiKeyRecord).toHaveBeenCalledWith(expect.objectContaining({ userId: "u1", organizationId: "org_1" }))
    })

    it("never consults team billing for a personal key", async () => {
        await ApiKeyService.create(personalScope("u1"), "Laptop")

        expect(isOrgSubscribed).not.toHaveBeenCalled()
        expect(createApiKeyRecord).toHaveBeenCalledWith(expect.objectContaining({ organizationId: null }))
    })
})
