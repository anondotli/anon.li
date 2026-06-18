import { beforeEach, describe, expect, it, vi } from "vitest"

const { formFindUnique, submissionFindMany, submissionCount } = vi.hoisted(() => ({
    formFindUnique: vi.fn(),
    submissionFindMany: vi.fn(),
    submissionCount: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        form: { findUnique: formFindUnique },
        formSubmission: { findMany: submissionFindMany, count: submissionCount },
    },
}))

import { FormService } from "@/lib/services/form"
import { personalScope } from "@/lib/ownership"

const OWNER = personalScope("user-1")
const FORM = { id: "form-1", userId: "user-1", organizationId: null, deletedAt: null }

describe("FormService.listSubmissions includePayload", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        formFindUnique.mockResolvedValue(FORM)
        submissionCount.mockResolvedValue(1)
    })

    it("omits ciphertext columns by default and never returns a payload", async () => {
        submissionFindMany.mockResolvedValue([
            { id: "s1", createdAt: new Date("2026-01-01"), readAt: null, attachedDropId: null },
        ])

        const result = await FormService.listSubmissions("form-1", OWNER)

        // No ciphertext columns requested when includePayload is not set.
        const select = submissionFindMany.mock.calls[0]![0].select
        expect(select.encryptedPayload).toBeUndefined()
        expect(select.ephemeralPubKey).toBeUndefined()
        expect(result.submissions[0]!.payload).toBeUndefined()
    })

    it("selects and returns ciphertext when includePayload is true", async () => {
        submissionFindMany.mockResolvedValue([
            {
                id: "s1",
                createdAt: new Date("2026-01-01"),
                readAt: null,
                attachedDropId: "drop-1",
                ephemeralPubKey: "epk",
                iv: "iv",
                encryptedPayload: "ct",
            },
        ])

        const result = await FormService.listSubmissions("form-1", OWNER, { includePayload: true })

        const select = submissionFindMany.mock.calls[0]![0].select
        expect(select.ephemeralPubKey).toBe(true)
        expect(select.iv).toBe(true)
        expect(select.encryptedPayload).toBe(true)

        expect(result.submissions[0]!.payload).toEqual({
            ephemeralPubKey: "epk",
            iv: "iv",
            encryptedPayload: "ct",
        })
        expect(result.submissions[0]!.hasAttachedDrop).toBe(true)
    })

    it("does not mark submissions read while listing payloads", async () => {
        submissionFindMany.mockResolvedValue([])
        await FormService.listSubmissions("form-1", OWNER, { includePayload: true })
        // Listing only reads; there is no update path on the submission model here.
        expect(submissionCount).toHaveBeenCalled()
    })

    it("rejects access from a non-owner scope", async () => {
        submissionFindMany.mockResolvedValue([])
        await expect(
            FormService.listSubmissions("form-1", personalScope("intruder"), { includePayload: true }),
        ).rejects.toThrow()
        expect(submissionFindMany).not.toHaveBeenCalled()
    })
})
