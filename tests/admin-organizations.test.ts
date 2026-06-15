import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { prisma } from "@/lib/prisma"

vi.mock("@/lib/prisma", () => ({
    prisma: {
        organization: {
            findMany: vi.fn(),
            findUnique: vi.fn(),
            count: vi.fn(),
        },
        member: {
            count: vi.fn(),
        },
        subscription: {
            findMany: vi.fn(),
            count: vi.fn(),
        },
        cryptoPayment: {
            findMany: vi.fn(),
        },
        auditLog: {
            findMany: vi.fn(),
        },
        user: {
            findMany: vi.fn(),
        },
    },
}))

const prismaMock = prisma as unknown as {
    organization: { findMany: Mock; findUnique: Mock; count: Mock }
    member: { count: Mock }
    subscription: { findMany: Mock; count: Mock }
    cryptoPayment: { findMany: Mock }
    auditLog: { findMany: Mock }
    user: { findMany: Mock }
}

describe("getAdminOrganizations", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("derives seat limit from the active subscription, else the free allowance", async () => {
        prismaMock.organization.findMany.mockResolvedValue([
            {
                id: "org_paid",
                name: "Paid Team",
                slug: "paid-team",
                createdAt: new Date("2026-06-01T00:00:00.000Z"),
                _count: { members: 4 },
                subscriptions: [{ seats: 5, tier: "pro", status: "active", product: "business" }],
            },
            {
                id: "org_free",
                name: "Free Team",
                slug: "free-team",
                createdAt: new Date("2026-06-02T00:00:00.000Z"),
                _count: { members: 1 },
                subscriptions: [],
            },
        ])
        prismaMock.organization.count.mockResolvedValue(2)
        prismaMock.member.count.mockResolvedValue(5)
        prismaMock.subscription.count.mockResolvedValue(1)

        const { getAdminOrganizations } = await import("@/lib/data/admin")
        const result = await getAdminOrganizations({})

        expect(result.organizations[0]).toMatchObject({
            id: "org_paid",
            memberCount: 4,
            seatLimit: 5,
        })
        expect(result.organizations[0]!.subscription).toMatchObject({ tier: "pro", status: "active" })
        expect(result.organizations[1]).toMatchObject({
            id: "org_free",
            memberCount: 1,
            seatLimit: 1,
            subscription: null,
        })
        expect(result.stats).toEqual({
            totalOrganizations: 2,
            totalMembers: 5,
            activeBusinessSubs: 1,
        })
    })

    it("filters by name or slug when a search term is provided", async () => {
        prismaMock.organization.findMany.mockResolvedValue([])
        prismaMock.organization.count.mockResolvedValue(0)
        prismaMock.member.count.mockResolvedValue(0)
        prismaMock.subscription.count.mockResolvedValue(0)

        const { getAdminOrganizations } = await import("@/lib/data/admin")
        await getAdminOrganizations({ search: "acme" })

        const where = prismaMock.organization.findMany.mock.calls[0]![0].where
        expect(where.OR).toEqual([
            { name: { contains: "acme", mode: "insensitive" } },
            { slug: { contains: "acme", mode: "insensitive" } },
        ])
    })
})

describe("getAdminOrgDetail", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("returns null when the organization does not exist", async () => {
        prismaMock.organization.findUnique.mockResolvedValue(null)

        const { getAdminOrgDetail } = await import("@/lib/data/admin")
        expect(await getAdminOrgDetail("missing")).toBeNull()
    })

    it("resolves audit actors and the active subscription / seat limit", async () => {
        prismaMock.organization.findUnique.mockResolvedValue({
            id: "org_1",
            name: "Acme",
            slug: "acme",
            logo: null,
            enforce2FA: true,
            orgKeyGeneration: 2,
            keyRotationRecommendedAt: null,
            createdAt: new Date("2026-06-01T00:00:00.000Z"),
            members: [
                { id: "m1", role: "owner", createdAt: new Date(), user: { id: "u1", email: "owner@acme.test", name: null } },
            ],
            invitations: [],
            subscriptions: [
                { id: "s1", provider: "stripe", providerSubscriptionId: "sub_1", product: "business", tier: "pro", status: "active", seats: 8, currentPeriodEnd: null, cancelAtPeriodEnd: false, createdAt: new Date() },
            ],
            _count: { aliases: 2, drops: 1, forms: 0, domains: 1, apiKeys: 3, members: 1, invitations: 0 },
        })
        prismaMock.auditLog.findMany.mockResolvedValue([
            { id: "log_1", action: "org.member.added", actorId: "u1", targetId: "u2", metadata: null, ip: null, createdAt: new Date() },
        ])
        prismaMock.user.findMany.mockResolvedValue([
            { id: "u1", email: "owner@acme.test", name: null },
        ])

        const { getAdminOrgDetail } = await import("@/lib/data/admin")
        const result = await getAdminOrgDetail("org_1")

        expect(result).not.toBeNull()
        expect(result!.activeSubscription).toMatchObject({ id: "s1", seats: 8 })
        expect(result!.seatLimit).toBe(8)
        expect(result!.auditLogs[0]!.actor).toMatchObject({ id: "u1", email: "owner@acme.test" })
        expect(result!._count.apiKeys).toBe(3)
    })
})

describe("getAdminBilling org surfacing", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("exposes organizationId, seats, and organization on org-owned subscriptions", async () => {
        prismaMock.subscription.findMany.mockResolvedValue([
            {
                id: "sub_org",
                provider: "stripe",
                providerSubscriptionId: "ps_1",
                providerCustomerId: "pc_1",
                providerPriceId: "pr_1",
                product: "business",
                tier: "pro",
                status: "active",
                seats: 6,
                organizationId: "org_1",
                currentPeriodStart: null,
                currentPeriodEnd: null,
                cancelAtPeriodEnd: false,
                createdAt: new Date(),
                updatedAt: new Date(),
                user: null,
                organization: { id: "org_1", name: "Acme", slug: "acme" },
            },
        ])
        prismaMock.subscription.count.mockResolvedValue(1)
        prismaMock.cryptoPayment.findMany.mockResolvedValue([])

        const { getAdminBilling } = await import("@/lib/data/admin")
        const result = await getAdminBilling({})

        expect(result.subscriptions[0]).toMatchObject({
            organizationId: "org_1",
            seats: 6,
            organization: { id: "org_1", name: "Acme", slug: "acme" },
            user: null,
        })
    })
})
