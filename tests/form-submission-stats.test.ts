import { beforeEach, describe, expect, it, vi } from "vitest"

const { formFindUnique, submissionCount } = vi.hoisted(() => ({
    formFindUnique: vi.fn(),
    submissionCount: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        form: { findUnique: formFindUnique },
        formSubmission: { count: submissionCount },
    },
}))

import { FormService } from "@/lib/services/form"
import { personalScope } from "@/lib/ownership"

const OWNER = personalScope("user-1")
const FORM = { id: "form-1", userId: "user-1", organizationId: null, deletedAt: null }

describe("FormService.getSubmissionStats", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        formFindUnique.mockResolvedValue(FORM)
    })

    it("returns total, unread and attachment counts with the right filters", async () => {
        submissionCount
            .mockResolvedValueOnce(5) // total
            .mockResolvedValueOnce(2) // unread
            .mockResolvedValueOnce(1) // withAttachments

        const stats = await FormService.getSubmissionStats("form-1", OWNER)

        expect(stats).toEqual({ total: 5, unread: 2, withAttachments: 1 })

        const wheres = submissionCount.mock.calls.map((c) => c[0]!.where)
        expect(wheres).toContainEqual({ formId: "form-1" })
        expect(wheres).toContainEqual({ formId: "form-1", readAt: null })
        expect(wheres).toContainEqual({ formId: "form-1", attachedDropId: { not: null } })
    })

    it("rejects access from a non-owner scope", async () => {
        await expect(
            FormService.getSubmissionStats("form-1", personalScope("intruder")),
        ).rejects.toThrow()
        expect(submissionCount).not.toHaveBeenCalled()
    })

    it("throws when the form is missing or deleted", async () => {
        formFindUnique.mockResolvedValueOnce(null)
        await expect(FormService.getSubmissionStats("missing", OWNER)).rejects.toThrow()
    })
})
