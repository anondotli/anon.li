/**
 * @vitest-environment node
 *
 * Admin report review (updateReport): side effects run only when the action is
 * new, the report-driven ban goes through the same guards + audit as the direct
 * ban, and takedowns are audit-logged.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    audit: vi.fn(),
    service: {
        getReportWithContext: vi.fn(),
        takedownDrop: vi.fn(),
        takedownAlias: vi.fn(),
        takedownForm: vi.fn(),
        getResourceOwnerUserId: vi.fn(),
        sendWarningEmail: vi.fn(),
        banUser: vi.fn(),
        resolveReport: vi.fn(),
        notifyReporter: vi.fn(),
        deleteDomain: vi.fn(),
    },
}))

vi.mock("@/lib/services/admin", () => ({ AdminService: mocks.service }))
vi.mock("@/lib/services/audit", () => ({ audit: mocks.audit }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/safe-action", () => ({
    runAdminAction: vi.fn(async (opts: { data?: unknown }, cb: (data: unknown, adminId: string) => unknown) => {
        try {
            return { success: true, data: await cb(opts.data, "admin_1") }
        } catch (error) {
            return { error: (error as Error).message }
        }
    }),
}))

import { banUser, deleteDomain, updateReport } from "@/actions/admin"

function reportContext(report: Partial<{ status: string; actionTaken: string | null; serviceType: string; resourceId: string }>) {
    return {
        report: { id: "rep_1", serviceType: "alias", resourceId: "bad@anon.li", status: "pending", actionTaken: null, ...report },
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    mocks.service.takedownAlias.mockResolvedValue({ violations: 1, banned: false })
    mocks.service.takedownDrop.mockResolvedValue({ violations: 1, banned: false })
    mocks.service.getResourceOwnerUserId.mockResolvedValue("user_1")
})

describe("updateReport side effects", () => {
    it("takes down and audit-logs an alias takedown on a pending report", async () => {
        mocks.service.getReportWithContext.mockResolvedValue(reportContext({}))

        await updateReport("rep_1", { status: "resolved", actionTaken: "takedown", takedownReason: "Phishing" })

        expect(mocks.service.takedownAlias).toHaveBeenCalledWith("bad@anon.li")
        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
            action: "alias.takedown",
            actorId: "admin_1",
            targetId: "bad@anon.li",
            metadata: expect.objectContaining({ reportId: "rep_1", reason: "Phishing" }),
        }))
    })

    it("does not audit a takedown that was already in place", async () => {
        mocks.service.getReportWithContext.mockResolvedValue(reportContext({ serviceType: "drop", resourceId: "drop_1" }))
        mocks.service.takedownDrop.mockResolvedValue({ violations: 1, banned: false, alreadyTakenDown: true })

        await updateReport("rep_1", { status: "resolved", actionTaken: "takedown" })

        expect(mocks.audit.mock.calls.map(([entry]) => entry.action)).not.toContain("drop.takedown")
    })

    it("re-saving a reviewed report with the same action does not repeat side effects", async () => {
        mocks.service.getReportWithContext.mockResolvedValue(reportContext({ status: "reviewed", actionTaken: "warning" }))

        const result = await updateReport("rep_1", { status: "resolved", actionTaken: "warning", notes: "closing" })

        expect(result.error).toBeUndefined()
        expect(mocks.service.sendWarningEmail).not.toHaveBeenCalled()
        expect(mocks.service.resolveReport).toHaveBeenCalledWith("rep_1", "resolved", "closing", "warning", "admin_1")
    })

    it("runs a newly chosen action on an already-reviewed report", async () => {
        mocks.service.getReportWithContext.mockResolvedValue(reportContext({ status: "reviewed", actionTaken: "warning" }))

        await updateReport("rep_1", { status: "resolved", actionTaken: "ban" })

        expect(mocks.service.banUser).toHaveBeenCalledWith("user_1", expect.objectContaining({ aliasCreation: true }))
    })

    it("report-driven ban is audit-logged like the direct ban", async () => {
        mocks.service.getReportWithContext.mockResolvedValue(reportContext({}))

        await updateReport("rep_1", { status: "resolved", actionTaken: "ban", notes: "spam" })

        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
            action: "user.ban",
            targetId: "user_1",
            metadata: expect.objectContaining({ aliasCreation: true, reason: "spam", reportId: "rep_1" }),
        }))
    })

    it("report-driven ban refuses to ban the acting admin", async () => {
        mocks.service.getReportWithContext.mockResolvedValue(reportContext({}))
        mocks.service.getResourceOwnerUserId.mockResolvedValue("admin_1")

        const result = await updateReport("rep_1", { status: "resolved", actionTaken: "ban" })

        expect(result.error).toBe("Cannot ban your own account")
        expect(mocks.service.banUser).not.toHaveBeenCalled()
        expect(mocks.service.resolveReport).not.toHaveBeenCalled()
    })
})

describe("direct admin actions", () => {
    it("banUser refuses self-ban with a user-facing error", async () => {
        const result = await banUser("admin_1", { full: true })
        expect(result.error).toBe("Cannot ban your own account")
        expect(mocks.service.banUser).not.toHaveBeenCalled()
    })

    it("deleteDomain records how many aliases were deleted", async () => {
        mocks.service.deleteDomain.mockResolvedValue({ success: true, domain: "example.com", aliasesDeleted: 7 })

        await deleteDomain("dom_1")

        expect(mocks.audit).toHaveBeenCalledWith(expect.objectContaining({
            action: "domain.delete",
            targetId: "dom_1",
            metadata: { domain: "example.com", aliasesDeleted: 7 },
        }))
    })
})
