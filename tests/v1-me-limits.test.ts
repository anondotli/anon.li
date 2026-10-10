/**
 * @vitest-environment node
 *
 * /api/v1/me reports the SAME limits enforcement applies: per-product tiers
 * (a Drop-only Pro user is not shown Pro alias/API limits), the admin storage
 * grant, all personal domains, and calendar-month form submissions.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const h = vi.hoisted(() => ({
    prisma: {
        user: { findUnique: vi.fn() },
        alias: { groupBy: vi.fn() },
        userSecurity: { findUnique: vi.fn() },
    },
    getFormLimitsAsync: vi.fn(),
    countActiveForms: vi.fn(),
    countCurrentMonthSubmissions: vi.fn(),
    ctx: {
        userId: "user-1" as string | null,
        requestId: "req-1",
        apiKeyId: "key-1" as string | undefined,
        organizationId: null as string | null,
        orgRole: null,
        user: { id: "user-1", subscriptions: [] as unknown[] },
    },
}))

vi.mock("@/lib/route-policy", () => ({
    withPolicy: (_policy: unknown, handler: (ctx: unknown) => Promise<Response>) =>
        (request: Request) => handler({ ...h.ctx, request }),
    scopeFromContext: (ctx: typeof h.ctx) => ({ userId: ctx.userId, organizationId: ctx.organizationId, role: ctx.orgRole }),
}))
vi.mock("@/lib/prisma", () => ({ prisma: h.prisma }))
vi.mock("@/lib/limits", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/limits")>()),
    getFormLimitsAsync: h.getFormLimitsAsync,
}))
vi.mock("@/lib/services/form", () => ({
    FormService: {
        countActiveForms: h.countActiveForms,
        countCurrentMonthSubmissions: h.countCurrentMonthSubmissions,
    },
}))

import { ALIAS_LIMITS, DROP_LIMITS, EXPIRY_LIMITS, FORM_LIMITS, STORAGE_LIMITS } from "@/config/plans"

const future = new Date(Date.now() + 20 * 86_400_000)

interface MeData {
    tier: string
    aliases: { random: { limit: number } }
    domains: { used: number }
    storage: { limit: string }
    forms: unknown
    limits: { api_requests: number; api_requests_by_product: unknown; max_expiry_days: number }
}

async function getMe(): Promise<MeData> {
    const { GET } = await import("@/app/api/v1/me/route")
    const response = await GET(new Request("http://localhost/api/v1/me"))
    expect(response.status).toBe(200)
    return ((await response.json()) as { data: MeData }).data
}

beforeEach(() => {
    vi.clearAllMocks()
    h.ctx.user = {
        id: "user-1",
        subscriptions: [{ status: "active", product: "drop", tier: "pro", currentPeriodEnd: future }],
    }
    h.prisma.user.findUnique.mockResolvedValue({
        id: "user-1",
        email: "u@example.com",
        name: null,
        storageUsed: BigInt(0),
        storageLimit: BigInt(0),
        createdAt: new Date("2026-01-01T00:00:00Z"),
        referralPlusUntil: null,
        _count: { aliases: 0, drops: 0, domains: 2, recipients: 1 },
    })
    h.prisma.alias.groupBy.mockResolvedValue([])
    h.prisma.userSecurity.findUnique.mockResolvedValue(null)
    h.getFormLimitsAsync.mockResolvedValue({ forms: 3, submissionsPerMonth: 100 })
    h.countActiveForms.mockResolvedValue(2)
    h.countCurrentMonthSubmissions.mockResolvedValue(42)
})

describe("GET /api/v1/me limits", () => {
    it("resolves limits per product for a Drop-only Pro subscriber", async () => {
        const me = await getMe()

        expect(me.tier).toBe("pro")
        expect(me.aliases.random.limit).toBe(ALIAS_LIMITS.free.random)
        expect(me.limits.api_requests).toBe(ALIAS_LIMITS.free.apiRequests)
        expect(me.limits.api_requests_by_product).toEqual({
            alias: ALIAS_LIMITS.free.apiRequests,
            drop: DROP_LIMITS.pro.apiRequests,
            form: FORM_LIMITS.free.apiRequests,
        })
        // Drop expiry follows the DROP tier, not the overall tier.
        expect(me.limits.max_expiry_days).toBe(EXPIRY_LIMITS.pro)
        expect(me.storage.limit).toBe(String(STORAGE_LIMITS.pro))
    })

    it("uses the plan's drop expiry even when another product carries the higher tier", async () => {
        h.ctx.user.subscriptions = [{ status: "active", product: "alias", tier: "pro", currentPeriodEnd: future }]
        const me = await getMe()
        expect(me.tier).toBe("pro")
        expect(me.limits.max_expiry_days).toBe(EXPIRY_LIMITS.free)
    })

    it("applies the admin storage grant as a floor, like upload enforcement", async () => {
        h.ctx.user.subscriptions = []
        const grant = STORAGE_LIMITS.free * 4
        h.prisma.user.findUnique.mockResolvedValueOnce({
            id: "user-1", email: "u@example.com", name: null,
            storageUsed: BigInt(0), storageLimit: BigInt(grant),
            createdAt: new Date(), referralPlusUntil: null,
            _count: { aliases: 0, drops: 0, domains: 0, recipients: 0 },
        })
        const me = await getMe()
        expect(me.storage.limit).toBe(String(grant))
    })

    it("reports forms with calendar-month submission usage from the enforcement helpers", async () => {
        const me = await getMe()
        expect(me.forms).toEqual({
            count: 2,
            limit: 3,
            submissions_this_month: { used: 42, limit: 100 },
        })
        expect(h.countCurrentMonthSubmissions).toHaveBeenCalledWith({ userId: "user-1", organizationId: null, role: null })
        expect(h.getFormLimitsAsync).toHaveBeenCalledWith("user-1")
    })

    it("counts every personal domain (verified or pending)", async () => {
        const me = await getMe()
        expect(me.domains.used).toBe(2)
        const select = h.prisma.user.findUnique.mock.calls[0]![0].select
        expect(select._count.select.domains).toEqual({ where: { organizationId: null } })
    })
})
