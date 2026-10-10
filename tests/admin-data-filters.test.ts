/**
 * @vitest-environment node
 *
 * Admin list queries: combined filters, SQL-side report ordering, report key
 * handling, held crypto visibility, distinct counts and the takedowns union.
 */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

const mocks = vi.hoisted(() => ({ decrypt: vi.fn((value: string) => `plain:${value}`) }))

vi.mock("@/lib/report-crypto", () => ({ safeDecryptReportKey: mocks.decrypt }))
vi.mock("@/lib/prisma", () => {
    const model = () => ({ findMany: vi.fn(), count: vi.fn() })
    return {
        prisma: {
            user: model(),
            apiKey: model(),
            form: model(),
            drop: model(),
            alias: model(),
            recipient: model(),
            abuseReport: model(),
            subscription: model(),
            cryptoPayment: model(),
            auditLog: model(),
            $queryRaw: vi.fn(),
        },
    }
})

import { prisma } from "@/lib/prisma"
import { ADMIN_PAGE_SIZE } from "@/lib/admin/constants"
import {
    getAdminApiKeys,
    getAdminAuditLogs,
    getAdminBilling,
    getAdminForms,
    getAdminRecipients,
    getAdminReports,
    getAdminTakedowns,
    getAdminUsers,
} from "@/lib/data/admin"

type Model = { findMany: Mock; count: Mock }
const db = prisma as unknown as Record<"user" | "apiKey" | "form" | "drop" | "alias" | "recipient" | "abuseReport" | "subscription" | "cryptoPayment" | "auditLog", Model> & { $queryRaw: Mock }

function whereOf(mock: Mock, call = 0) {
    return mock.mock.calls[call]![0].where
}

/** Flattens a Prisma.Sql (or tagged-template call) into its SQL text. */
function sqlText(call: unknown[]): string {
    const [first] = call as [unknown]
    if (Array.isArray(first)) return (first as string[]).join("?")
    return (first as { sql: string }).sql
}

beforeEach(() => {
    vi.clearAllMocks()
    for (const key of ["user", "apiKey", "form", "drop", "alias", "recipient", "abuseReport", "subscription", "cryptoPayment", "auditLog"] as const) {
        db[key].findMany.mockResolvedValue([])
        db[key].count.mockResolvedValue(0)
    }
    db.$queryRaw.mockResolvedValue([])
})

describe("combined OR filters", () => {
    it("users: search and the banned filter are both applied", async () => {
        await getAdminUsers({ search: "bob", filter: "banned" })
        const where = whereOf(db.user.findMany)
        expect(where.OR).toBeUndefined()
        expect(where.AND).toHaveLength(2)
        expect(where.AND[0].OR[0]).toEqual({ email: { contains: "bob", mode: "insensitive" } })
        expect(where.AND[1].OR).toEqual([{ banned: true }, { banAliasCreation: true }, { banFileUpload: true }])
    })

    it("api keys: search and the active filter are both applied", async () => {
        await getAdminApiKeys({ search: "ak_", filter: "active" })
        const where = whereOf(db.apiKey.findMany)
        expect(where.OR).toBeUndefined()
        expect(where.AND).toHaveLength(2)
        expect(where.AND[1].OR).toEqual([{ expiresAt: null }, { expiresAt: { gte: expect.any(Date) } }])
    })

    it("forms: the disabled filter counts the active column and keeps the search", async () => {
        await getAdminForms({ search: "intake", filter: "disabled" })
        const where = whereOf(db.form.findMany)
        expect(where.OR).toHaveLength(3)
        expect(where.AND).toEqual([{ OR: [{ disabledByUser: true }, { active: false }] }])
        expect(where.takenDown).toBe(false)
    })

    it("forms: the active filter requires the active column too", async () => {
        await getAdminForms({ filter: "active" })
        expect(whereOf(db.form.findMany)).toMatchObject({ active: true, disabledByUser: false, takenDown: false })
    })
})

describe("getAdminReports", () => {
    it("orders by priority in SQL and keeps that order across the page", async () => {
        db.$queryRaw.mockResolvedValue([{ id: "r_urgent" }, { id: "r_low" }])
        db.abuseReport.count.mockResolvedValue(2)
        db.abuseReport.findMany.mockResolvedValue([
            { id: "r_low", serviceType: "drop", decryptionKey: null, decryptionKeyEncrypted: false, priority: "low", createdAt: new Date() },
            { id: "r_urgent", serviceType: "drop", decryptionKey: null, decryptionKeyEncrypted: false, priority: "urgent", createdAt: new Date() },
        ])

        const result = await getAdminReports({ status: "all", page: "2" })

        const call = db.$queryRaw.mock.calls[0]!
        const text = sqlText(call)
        expect(text).toMatch(/ORDER BY CASE "priority"/)
        expect(call).toContain(ADMIN_PAGE_SIZE)
        expect(result.reports.map((r) => r.id)).toEqual(["r_urgent", "r_low"])
    })

    it("treats status=all as no status filter", async () => {
        await getAdminReports({ status: "all" })
        expect(whereOf(db.abuseReport.count)).not.toHaveProperty("status")
    })

    it("defaults to pending and filters by form type", async () => {
        await getAdminReports({ type: "form" })
        expect(whereOf(db.abuseReport.count)).toMatchObject({ status: "pending", serviceType: "form" })
    })

    it("decrypts stored keys per row and never returns reporterIp", async () => {
        db.$queryRaw.mockResolvedValue([{ id: "r1" }, { id: "r2" }])
        db.abuseReport.findMany.mockResolvedValue([
            { id: "r1", decryptionKey: "cipher", decryptionKeyEncrypted: true, createdAt: new Date() },
            { id: "r2", decryptionKey: "legacy", decryptionKeyEncrypted: false, createdAt: new Date() },
        ])

        const result = await getAdminReports({})

        expect(db.abuseReport.findMany.mock.calls[0]![0].select).not.toHaveProperty("reporterIp")
        expect(result.reports[0]).toMatchObject({ id: "r1", decryptionKey: "plain:cipher" })
        expect(result.reports[1]).toMatchObject({ id: "r2", decryptionKey: "legacy" })
        expect(result.reports[0]).not.toHaveProperty("decryptionKeyEncrypted")
        expect(mocks.decrypt).toHaveBeenCalledTimes(1)
    })
})

describe("getAdminBilling", () => {
    it("always lists held crypto payments first, outside the recent window", async () => {
        const held = { id: "held_1", status: "needs_review" }
        const recent = { id: "recent_1", status: "finished" }
        db.cryptoPayment.findMany.mockResolvedValueOnce([held]).mockResolvedValueOnce([recent])

        const result = await getAdminBilling({})

        const heldQuery = db.cryptoPayment.findMany.mock.calls[0]![0]
        expect(heldQuery.where).toMatchObject({ status: "needs_review" })
        expect(heldQuery).not.toHaveProperty("take")
        expect(db.cryptoPayment.findMany.mock.calls[1]![0].where).toMatchObject({ status: { not: "needs_review" } })
        expect(result.cryptoPayments.map((p) => p.id)).toEqual(["held_1", "recent_1"])
    })
})

describe("counts", () => {
    it("recipient alias count is the distinct alias count from SQL", async () => {
        db.recipient.findMany.mockResolvedValue([{ id: "rcp_1", user: null }])
        db.$queryRaw.mockResolvedValue([{ recipientId: "rcp_1", count: BigInt(2) }])

        const result = await getAdminRecipients({})

        expect(sqlText(db.$queryRaw.mock.calls[0]!)).toMatch(/COUNT\(DISTINCT/)
        expect(result.recipients[0]).toMatchObject({ id: "rcp_1", aliasCount: 2 })
    })

    it("audit action filter options come from the static list, not a table scan", async () => {
        const result = await getAdminAuditLogs({})
        expect(db.auditLog.findMany).toHaveBeenCalledTimes(1)
        expect(result.actions).toContain("alias.takedown")
        expect(result.actions).toContain("user.ban")
    })
})

describe("getAdminTakedowns", () => {
    it("merges drop, form and alias takedowns newest first", async () => {
        db.drop.findMany.mockResolvedValue([
            { id: "drop_1", takedownReason: "Malware", takenDownAt: new Date("2026-10-01"), user: null, _count: { files: 2 } },
        ])
        db.drop.count.mockResolvedValue(1)
        db.form.findMany.mockResolvedValue([
            { id: "form_1", title: "Phish", takedownReason: "Phishing", takenDownAt: new Date("2026-10-03"), submissionsCount: 1, user: null },
        ])
        db.form.count.mockResolvedValue(1)
        db.alias.findMany.mockResolvedValue([
            { id: "alias_1", email: "bad@anon.li", takenDownAt: new Date("2026-10-02"), active: false, user: null },
        ])
        db.alias.count.mockResolvedValue(1)

        const result = await getAdminTakedowns({})

        expect(result.total).toBe(3)
        expect(result.takedowns.map((row) => `${row.type}:${row.id}`)).toEqual(["form:form_1", "alias:alias_1", "drop:drop_1"])
        expect(whereOf(db.alias.findMany)).toMatchObject({ takenDownAt: { not: null } })
    })

    it("restricts to one type when filtered", async () => {
        await getAdminTakedowns({ type: "form" })
        expect(db.form.findMany).toHaveBeenCalled()
        expect(db.drop.findMany).not.toHaveBeenCalled()
        expect(db.alias.findMany).not.toHaveBeenCalled()
    })
})
