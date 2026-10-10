/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma, deleteDrop, getFormOwnerEntitlements } = vi.hoisted(() => ({
    prisma: {
        formSubmission: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
        form: { findMany: vi.fn(), delete: vi.fn() },
        drop: { updateMany: vi.fn() },
    },
    deleteDrop: vi.fn(),
    getFormOwnerEntitlements: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/services/drop", () => ({ DropService: { deleteDrop } }))
vi.mock("@/lib/services/form-entitlements", () => ({ getFormOwnerEntitlements }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { FormCleanupService } from "@/lib/services/form-cleanup"
import { FormService } from "@/lib/services/form"

const DAY_MS = 24 * 60 * 60 * 1000
const reapMark = {
    where: { id: "drop-1", deletedAt: null },
    data: { deletedAt: expect.any(Date) },
}

beforeEach(() => {
    vi.clearAllMocks()
    deleteDrop.mockRejectedValue(new Error("storage unavailable"))
    prisma.drop.updateMany.mockResolvedValue({ count: 1 })
    prisma.formSubmission.delete.mockResolvedValue({})
    prisma.form.delete.mockResolvedValue({})
    getFormOwnerEntitlements.mockResolvedValue({
        limits: { retentionDays: 30 },
        tiers: { form: "free", drop: "free" },
        subscribed: true,
    })
})

function expiredSubmission() {
    prisma.formSubmission.findMany.mockResolvedValueOnce([{
        id: "submission-1",
        formId: "form-1",
        createdAt: new Date(Date.now() - 60 * DAY_MS),
        attachedDropId: "drop-1",
    }])
    prisma.form.findMany.mockResolvedValueOnce([{
        id: "form-1",
        userId: "owner-1",
        organizationId: null,
        user: { downgradedAt: null, subscriptions: [] },
        organization: null,
    }])
}

describe("attachment drops whose delete fails are never orphaned", () => {
    it("retention cleanup soft-deletes the drop before removing the submission", async () => {
        expiredSubmission()

        await expect(FormCleanupService.cleanupExpiredSubmissions()).resolves.toMatchObject({ deleted: 1 })

        expect(prisma.drop.updateMany).toHaveBeenCalledWith(reapMark)
        const markOrder = prisma.drop.updateMany.mock.invocationCallOrder[0] ?? Infinity
        const deleteOrder = prisma.formSubmission.delete.mock.invocationCallOrder[0] ?? -1
        expect(markOrder).toBeLessThan(deleteOrder)
    })

    it("keeps the submission for a later retry when the drop can't even be marked", async () => {
        expiredSubmission()
        prisma.drop.updateMany.mockRejectedValue(new Error("db down"))

        await expect(FormCleanupService.cleanupExpiredSubmissions()).resolves.toMatchObject({
            deleted: 0,
            errors: ["submission-1"],
        })
        expect(prisma.formSubmission.delete).not.toHaveBeenCalled()
    })

    it("deleted-form cleanup marks attachments of an ownerless form instead of skipping them", async () => {
        prisma.form.findMany.mockResolvedValueOnce([{
            id: "form-1",
            userId: null,
            organizationId: null,
            deletedAt: new Date(Date.now() - 30 * DAY_MS),
            submissions: [{ id: "submission-1", attachedDropId: "drop-1" }],
        }])

        await expect(FormCleanupService.cleanupDeletedForms()).resolves.toMatchObject({ deleted: 1 })
        expect(prisma.drop.updateMany).toHaveBeenCalledWith(reapMark)
        expect(prisma.form.delete).toHaveBeenCalledWith({ where: { id: "form-1" } })
    })

    it("deleting a submission marks its drop when the drop delete fails", async () => {
        prisma.formSubmission.findUnique.mockResolvedValue({
            id: "submission-1",
            attachedDropId: "drop-1",
            form: { userId: "owner-1", organizationId: null },
        })

        await FormService.deleteSubmission("submission-1", {
            userId: "owner-1",
            organizationId: null,
            role: null,
        })

        expect(prisma.drop.updateMany).toHaveBeenCalledWith(reapMark)
        expect(prisma.formSubmission.delete).toHaveBeenCalledWith({ where: { id: "submission-1" } })
    })
})
