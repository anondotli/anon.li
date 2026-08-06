/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"

const { sendEmail } = vi.hoisted(() => ({ sendEmail: vi.fn() }))

vi.mock("resend", () => ({
    Resend: class {
        emails = { send: sendEmail }
    },
}))

vi.mock("@/lib/prisma", () => {
    const mock = {
        form: { findUnique: vi.fn(), update: vi.fn() },
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        $transaction: vi.fn((arg: unknown) =>
            Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
        ),
    }
    return { prisma: mock }
})

vi.mock("@/lib/services/drop-storage", () => ({
    deleteDropFilesAndReleaseQuota: vi.fn(),
}))
vi.mock("@/lib/storage", () => ({ abortMultipartUpload: vi.fn() }))

import { AdminService } from "@/lib/services/admin"
import { prisma } from "@/lib/prisma"

const db = prisma as unknown as {
    form: { findUnique: Mock; update: Mock }
    $queryRaw: Mock
    $executeRaw: Mock
    $transaction: Mock
}

beforeEach(() => {
    vi.clearAllMocks()
    db.$queryRaw.mockResolvedValue([{ tosViolations: 1, banned: false }])
    db.$executeRaw.mockResolvedValue(1)
})

describe("AdminService — form takedown / restore", () => {
    it("takes a form down without touching the owner's disable/active intent", async () => {
        db.form.findUnique.mockResolvedValue({
            id: "form_1",
            title: "Intake",
            user: { id: "user_1", email: "owner@example.com", tosViolations: 0 },
        })

        await AdminService.takedownForm("form_1", "Phishing")

        // `takenDown` is the enforcement flag. Writing disabledByUser/active here
        // would destroy the owner's own setting with nowhere to restore it from.
        const data = db.form.update.mock.calls[0][0].data
        expect(data).toMatchObject({ takenDown: true, takedownReason: "Phishing" })
        expect(data).not.toHaveProperty("disabledByUser")
        expect(data).not.toHaveProperty("active")
    })

    it("restores a form without re-enabling one the owner had disabled", async () => {
        db.form.findUnique.mockResolvedValue({
            id: "form_1",
            takenDown: true,
            userId: "user_1",
        })

        await AdminService.restoreForm("form_1")

        const data = db.form.update.mock.calls[0][0].data
        expect(data).toEqual({ takenDown: false, takedownReason: null, takenDownAt: null })
    })

    it("skips the strike decrement for an org form whose creator was deleted", async () => {
        // Form.userId is SetNull on user deletion, so an org-owned form can outlive
        // its creator. `WHERE "id" = NULL` would silently match zero rows.
        db.form.findUnique.mockResolvedValue({
            id: "form_1",
            takenDown: true,
            userId: null,
        })

        await expect(AdminService.restoreForm("form_1")).resolves.toEqual({ success: true })

        expect(db.form.update).toHaveBeenCalledTimes(1)
        expect(db.$executeRaw).not.toHaveBeenCalled()
    })

    it("decrements the owner's strike count when the form has an owner", async () => {
        db.form.findUnique.mockResolvedValue({
            id: "form_1",
            takenDown: true,
            userId: "user_1",
        })

        await AdminService.restoreForm("form_1")

        expect(db.$executeRaw).toHaveBeenCalledTimes(1)
        // Tagged template: call is [strings, ...values], so userId is a member.
        expect(db.$executeRaw.mock.calls[0]).toContain("user_1")
    })

    it("refuses to restore a form that is not taken down", async () => {
        db.form.findUnique.mockResolvedValue({
            id: "form_1",
            takenDown: false,
            userId: "user_1",
        })

        await expect(AdminService.restoreForm("form_1"))
            .rejects.toMatchObject({ name: "ValidationError" })
        expect(db.form.update).not.toHaveBeenCalled()
    })

    it("strikes nothing for an org form with no surviving creator on takedown", async () => {
        db.form.findUnique.mockResolvedValue({
            id: "form_1",
            title: "Intake",
            user: null,
        })

        await expect(AdminService.takedownForm("form_1", "Spam")).resolves.toEqual({
            violations: 0,
            banned: false,
        })

        expect(db.$queryRaw).not.toHaveBeenCalled()
        expect(sendEmail).not.toHaveBeenCalled()
    })
})
