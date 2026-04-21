import { beforeEach, describe, expect, it, vi } from "vitest"

const prismaMocks = vi.hoisted(() => ({
    findUserById: vi.fn(),
    findApiKey: vi.fn(),
    updateApiKey: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: {
            findUnique: prismaMocks.findUserById,
        },
        apiKey: {
            findUnique: prismaMocks.findApiKey,
            update: prismaMocks.updateApiKey,
        },
    },
}))

import { getAuthApiKeyRecord, getAuthUserState, touchApiKeyLastUsed } from "@/lib/data/auth"

describe("auth access state", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("returns null for users with an active deletion request", async () => {
        prismaMocks.findUserById.mockResolvedValue({
            id: "user_123",
            isAdmin: false,
            banned: false,
            twoFactorEnabled: false,
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
            deletionRequest: { id: "dr_123" },
        })

        await expect(getAuthUserState("user_123")).resolves.toBeNull()
    })

    it("returns active users without the deletion relation", async () => {
        prismaMocks.findUserById.mockResolvedValue({
            id: "user_123",
            isAdmin: true,
            banned: false,
            twoFactorEnabled: true,
            stripeSubscriptionId: "sub_123",
            stripePriceId: "price_123",
            stripeCurrentPeriodEnd: null,
            deletionRequest: null,
        })

        await expect(getAuthUserState("user_123")).resolves.toEqual({
            id: "user_123",
            isAdmin: true,
            banned: false,
            twoFactorEnabled: true,
            stripeSubscriptionId: "sub_123",
            stripePriceId: "price_123",
            stripeCurrentPeriodEnd: null,
        })
    })

    it("rejects API keys for accounts pending deletion", async () => {
        prismaMocks.findApiKey.mockResolvedValue({
            id: "api_key_123",
            expiresAt: null,
            user: {
                id: "user_123",
                banned: false,
                stripeSubscriptionId: null,
                stripePriceId: null,
                stripeCurrentPeriodEnd: null,
                deletionRequest: { id: "dr_123" },
            },
        })

        await expect(getAuthApiKeyRecord("hash_123")).resolves.toBeNull()
    })

    it("updates the API key last-used timestamp", async () => {
        prismaMocks.updateApiKey.mockResolvedValue(undefined)

        await touchApiKeyLastUsed("api_key_123")

        expect(prismaMocks.updateApiKey).toHaveBeenCalledWith({
            where: { id: "api_key_123" },
            data: { lastUsedAt: expect.any(Date) },
        })
    })
})
