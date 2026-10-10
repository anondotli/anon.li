/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getApiKeyById, deleteApiKeyById } = vi.hoisted(() => ({
    getApiKeyById: vi.fn(),
    deleteApiKeyById: vi.fn(),
}))

vi.mock("@/lib/data/api-key", () => ({
    getApiKeyById,
    deleteApiKeyById,
    createApiKeyRecord: vi.fn(),
}))
vi.mock("@/lib/data/user", () => ({ getUserById: vi.fn() }))

import { ApiKeyService } from "@/lib/services/api-key"
import { orgScope, personalScope } from "@/lib/ownership"
import { ForbiddenError, NotFoundError } from "@/lib/api-error-utils"

beforeEach(() => {
    vi.clearAllMocks()
    deleteApiKeyById.mockResolvedValue(undefined)
})

describe("ApiKeyService.delete — org RBAC", () => {
    it("lets a plain member revoke an org key they created", async () => {
        getApiKeyById.mockResolvedValue({ id: "k1", userId: "u_member", organizationId: "org_1" })

        await ApiKeyService.delete(orgScope("u_member", "org_1", "member"), "k1")

        expect(deleteApiKeyById).toHaveBeenCalledWith("k1")
    })

    it("still forbids a plain member from revoking another member's org key", async () => {
        getApiKeyById.mockResolvedValue({ id: "k2", userId: "u_other", organizationId: "org_1" })

        await expect(ApiKeyService.delete(orgScope("u_member", "org_1", "member"), "k2"))
            .rejects.toBeInstanceOf(ForbiddenError)
        expect(deleteApiKeyById).not.toHaveBeenCalled()
    })

    it("lets an org admin revoke another member's org key", async () => {
        getApiKeyById.mockResolvedValue({ id: "k2", userId: "u_other", organizationId: "org_1" })

        await ApiKeyService.delete(orgScope("u_admin", "org_1", "admin"), "k2")

        expect(deleteApiKeyById).toHaveBeenCalledWith("k2")
    })

    it("does not let the creator reach their org key from another tenant scope", async () => {
        getApiKeyById.mockResolvedValue({ id: "k1", userId: "u_member", organizationId: "org_1" })

        await expect(ApiKeyService.delete(personalScope("u_member"), "k1"))
            .rejects.toBeInstanceOf(NotFoundError)
        await expect(ApiKeyService.delete(orgScope("u_member", "org_2", "owner"), "k1"))
            .rejects.toBeInstanceOf(NotFoundError)
        expect(deleteApiKeyById).not.toHaveBeenCalled()
    })
})
