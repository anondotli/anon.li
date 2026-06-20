import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { prisma } from "@/lib/prisma"

// getAdminDashboardStats fans out into ~29 count calls. Mock the full prisma
// surface it touches so we can assert the admin-exclusion filter is applied to
// every entity count (and to user counts, minus the moderation count).
vi.mock("@/lib/prisma", () => {
    const count = () => vi.fn().mockResolvedValue(0)
    return {
        prisma: {
            user: { count: count(), aggregate: vi.fn().mockResolvedValue({ _sum: { storageUsed: BigInt(0) } }) },
            drop: { count: count() },
            alias: { count: count() },
            form: { count: count() },
            subscription: { count: count() },
            abuseReport: { count: count() },
            deletionRequest: { count: count() },
            orphanedFile: { count: count() },
            cryptoPayment: { count: count() },
            recipient: { count: count() },
            domain: { count: count() },
            organization: { count: count() },
            member: { count: count() },
        },
    }
})

type CountMock = { count: Mock; aggregate?: Mock }
const db = prisma as unknown as Record<string, CountMock>

const NOT_ADMIN_OWNED = { user: { isAdmin: true } }

/** All `where` arguments a given model's count() was invoked with. */
function whereArgs(model: string): Array<Record<string, unknown>> {
    return db[model]!.count.mock.calls.map((c) => (c[0]?.where ?? {}) as Record<string, unknown>)
}

describe("getAdminDashboardStats admin exclusion", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("excludes admin-owned records from every entity count", async () => {
        const { getAdminDashboardStats } = await import("@/lib/data/admin")
        await getAdminDashboardStats()

        // Owned entities filter via the relation `NOT: { user: { isAdmin: true } }`,
        // which keeps null-owner rows (anonymous drops, org rows w/ deleted creator).
        for (const model of ["drop", "alias", "form", "subscription"]) {
            const calls = whereArgs(model)
            expect(calls.length).toBeGreaterThan(0)
            for (const where of calls) {
                expect(where.NOT).toEqual(NOT_ADMIN_OWNED)
            }
        }
    })

    it("excludes admin accounts from user growth counts but not the moderation count", async () => {
        const { getAdminDashboardStats } = await import("@/lib/data/admin")
        await getAdminDashboardStats()

        const calls = whereArgs("user")
        expect(calls.length).toBeGreaterThan(0)
        for (const where of calls) {
            if ("OR" in where) {
                // The banned/abuse count is a moderation signal — admins stay counted.
                expect(where.isAdmin).toBeUndefined()
            } else {
                expect(where.isAdmin).toBe(false)
            }
        }
    })
})
