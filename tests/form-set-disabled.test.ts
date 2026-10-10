/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma } = vi.hoisted(() => ({
    prisma: {
        form: { findUnique: vi.fn(), update: vi.fn(), findMany: vi.fn(), count: vi.fn() },
        formSubmission: { findMany: vi.fn(), count: vi.fn() },
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/services/form-entitlements", () => ({ getFormOwnerEntitlements: vi.fn() }))
vi.mock("@/lib/services/drop", () => ({ DropService: { deleteDrop: vi.fn() } }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { FormService } from "@/lib/services/form"
import { ForbiddenError, NotFoundError } from "@/lib/api-error-utils"
import { orgScope, personalScope } from "@/lib/ownership"

function formRow(overrides: Record<string, unknown> = {}) {
    return { id: "form-1", userId: "user-1", organizationId: null, deletedAt: null, disabledByUser: false, ...overrides }
}

describe("FormService.setFormDisabled", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("sets disabledByUser to the requested value", async () => {
        prisma.form.findUnique.mockResolvedValueOnce(formRow())
        await expect(FormService.setFormDisabled("form-1", personalScope("user-1"), true)).resolves.toBe(true)
        expect(prisma.form.update).toHaveBeenCalledWith({ where: { id: "form-1" }, data: { disabledByUser: true } })
    })

    it("does not flip back when called again with the same state", async () => {
        prisma.form.findUnique.mockResolvedValueOnce(formRow({ disabledByUser: true }))
        await expect(FormService.setFormDisabled("form-1", personalScope("user-1"), true)).resolves.toBe(true)
        expect(prisma.form.update).not.toHaveBeenCalled()
    })

    it("treats soft-deleted and foreign forms as NOT_FOUND", async () => {
        prisma.form.findUnique.mockResolvedValueOnce(formRow({ deletedAt: new Date() }))
        await expect(FormService.setFormDisabled("form-1", personalScope("user-1"), true))
            .rejects.toBeInstanceOf(NotFoundError)
        prisma.form.findUnique.mockResolvedValueOnce(formRow({ userId: "someone-else" }))
        await expect(FormService.setFormDisabled("form-1", personalScope("user-1"), true))
            .rejects.toBeInstanceOf(NotFoundError)
        expect(prisma.form.update).not.toHaveBeenCalled()
    })

    it("requires admin+ for a shared org form, like toggleForm", async () => {
        prisma.form.findUnique.mockResolvedValueOnce(formRow({ organizationId: "org-1" }))
        await expect(FormService.setFormDisabled("form-1", orgScope("user-1", "org-1", "member"), true))
            .rejects.toBeInstanceOf(ForbiddenError)
        expect(prisma.form.update).not.toHaveBeenCalled()
    })
})

describe("form offset pagination", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("listForms breaks createdAt ties by id", async () => {
        prisma.form.findMany.mockResolvedValueOnce([])
        prisma.form.count.mockResolvedValueOnce(0)
        await FormService.listForms(personalScope("user-1"), { limit: 10, offset: 20 })
        expect(prisma.form.findMany).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }))
    })

    it("listSubmissions breaks createdAt ties by id", async () => {
        prisma.form.findUnique.mockResolvedValueOnce(formRow())
        prisma.formSubmission.findMany.mockResolvedValueOnce([])
        prisma.formSubmission.count.mockResolvedValueOnce(0)
        await FormService.listSubmissions("form-1", personalScope("user-1"), { limit: 10, offset: 20 })
        expect(prisma.formSubmission.findMany).toHaveBeenCalledWith(expect.objectContaining({
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        }))
    })
})
