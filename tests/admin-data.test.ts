import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { STORAGE_LIMITS } from "@/config/plans"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/prisma", () => ({
    prisma: {
        alias: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        user: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
    },
}))

describe("admin data mappers", () => {
    const prismaMock = prisma as unknown as {
        alias: { findMany: Mock; count: Mock }
        user: { findMany: Mock; count: Mock }
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("uses AliasRecipient routing before legacy recipient fallback", async () => {
        const now = new Date("2026-04-17T10:00:00.000Z")
        prismaMock.alias.findMany.mockResolvedValue([
            {
                id: "alias_1",
                email: "team@example.com",
                active: true,
                format: "CUSTOM",
                emailsReceived: 0,
                emailsBlocked: 0,
                lastEmailAt: null,
                scheduledForRemovalAt: null,
                createdAt: now,
                user: { id: "user_1", email: "owner@example.com" },
                recipient: { id: "legacy", email: "legacy@example.com", verified: true, pgpFingerprint: null },
                aliasRecipients: [
                    {
                        ordinal: 1,
                        isPrimary: false,
                        recipient: { id: "r2", email: "second@example.com", verified: true, pgpFingerprint: null },
                    },
                    {
                        ordinal: 0,
                        isPrimary: true,
                        recipient: { id: "r1", email: "first@example.com", verified: true, pgpFingerprint: null },
                    },
                ],
            },
            {
                id: "alias_2",
                email: "legacy@example.com",
                active: true,
                format: "CUSTOM",
                emailsReceived: 0,
                emailsBlocked: 0,
                lastEmailAt: null,
                scheduledForRemovalAt: null,
                createdAt: now,
                user: { id: "user_1", email: "owner@example.com" },
                recipient: { id: "legacy", email: "legacy@example.com", verified: true, pgpFingerprint: null },
                aliasRecipients: [],
            },
        ])
        prismaMock.alias.count.mockResolvedValue(2)

        const { getAdminAliases } = await import("@/lib/data/admin")
        const result = await getAdminAliases({})

        expect(result.aliases[0]!.recipients.map((recipient) => recipient.email)).toEqual([
            "first@example.com",
            "second@example.com",
        ])
        expect(result.aliases[0]!.recipients.every((recipient) => recipient.source === "routing")).toBe(true)
        expect(result.aliases[1]!.recipients).toMatchObject([
            { email: "legacy@example.com", source: "legacy", isPrimary: true },
        ])
    })

    it("derives admin storage limits from active canonical drop subscriptions", async () => {
        prismaMock.user.findMany.mockResolvedValue([
            {
                id: "user_1",
                email: "drop-pro@example.com",
                name: null,
                isAdmin: false,
                banned: false,
                banAliasCreation: false,
                banFileUpload: false,
                banReason: null,
                tosViolations: 0,
                stripePriceId: null,
                stripeCurrentPeriodEnd: null,
                stripeCancelAtPeriodEnd: false,
                paymentMethod: "crypto",
                storageUsed: BigInt(1024),
                createdAt: new Date("2026-04-17T10:00:00.000Z"),
                updatedAt: new Date("2026-04-17T10:00:00.000Z"),
                twoFactorEnabled: false,
                downgradedAt: null,
                subscriptions: [
                    {
                        provider: "crypto",
                        providerSubscriptionId: "crypto_1",
                        providerCustomerId: null,
                        providerPriceId: "price_1",
                        product: "drop",
                        tier: "pro",
                        status: "active",
                        currentPeriodEnd: new Date("2026-05-17T10:00:00.000Z"),
                        cancelAtPeriodEnd: false,
                        createdAt: new Date("2026-04-17T10:00:00.000Z"),
                    },
                ],
                cryptoPayments: [],
                deletionRequest: null,
                security: null,
                _count: { aliases: 0, drops: 0, recipients: 0, domains: 0, apiKeys: 0 },
            },
        ])
        prismaMock.user.count.mockResolvedValue(1)

        const { getAdminUsers } = await import("@/lib/data/admin")
        const result = await getAdminUsers({})

        expect(result.users[0]!.primarySubscription?.provider).toBe("crypto")
        expect(result.users[0]!.storageLimit).toBe(BigInt(STORAGE_LIMITS.pro).toString())
    })
})
