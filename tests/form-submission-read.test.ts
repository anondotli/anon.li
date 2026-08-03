import { beforeEach, describe, expect, it, vi } from "vitest"

const { submissionFindUnique, submissionUpdateMany } = vi.hoisted(() => ({
    submissionFindUnique: vi.fn(),
    submissionUpdateMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        formSubmission: {
            findUnique: submissionFindUnique,
            updateMany: submissionUpdateMany,
        },
    },
}))

import { FormService } from "@/lib/services/form"
import { personalScope } from "@/lib/ownership"

const OWNER = personalScope("user-1")
const SUBMISSION = {
    id: "submission-1",
    ephemeralPubKey: "epk",
    iv: "iv",
    encryptedPayload: "ciphertext",
    attachedDropId: null,
    createdAt: new Date("2026-01-01T00:00:00.000Z"),
    readAt: null,
    form: { userId: "user-1", organizationId: null, deletedAt: null },
}

describe("FormService submission read state", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        submissionFindUnique.mockResolvedValue(SUBMISSION)
    })

    it("keeps getSubmission read-only", async () => {
        const result = await FormService.getSubmission("submission-1", OWNER)

        expect(result.readAt).toBeNull()
        expect(submissionUpdateMany).not.toHaveBeenCalled()
    })

    it("marks an owned submission read with an idempotent conditional update", async () => {
        submissionUpdateMany.mockResolvedValue({ count: 1 })

        const readAt = await FormService.markSubmissionRead("submission-1", OWNER)

        expect(readAt).toBeInstanceOf(Date)
        expect(submissionUpdateMany).toHaveBeenCalledWith({
            where: { id: "submission-1", readAt: null },
            data: { readAt },
        })
    })

    it("rejects cross-tenant read-state changes", async () => {
        await expect(
            FormService.markSubmissionRead("submission-1", personalScope("intruder")),
        ).rejects.toThrow()
        expect(submissionUpdateMany).not.toHaveBeenCalled()
    })
})
