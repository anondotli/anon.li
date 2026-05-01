import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    getValidUploadTokenForRequest,
    getFormLimitsAsync,
    getEffectiveTiers,
    formFindUnique,
    dropFindUnique,
    dropFileFindMany,
} = vi.hoisted(() => ({
    getValidUploadTokenForRequest: vi.fn(),
    getFormLimitsAsync: vi.fn(),
    getEffectiveTiers: vi.fn(),
    formFindUnique: vi.fn(),
    dropFindUnique: vi.fn(),
    dropFileFindMany: vi.fn(),
}))

vi.mock("@/lib/services/drop-upload-token", () => ({
    getValidUploadTokenForRequest,
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        form: { findUnique: formFindUnique },
        drop: { findUnique: dropFindUnique },
        dropFile: { findMany: dropFileFindMany },
    },
}))

vi.mock("@/lib/limits", () => ({
    getFormLimitsAsync,
}))

vi.mock("@/lib/entitlements", () => ({
    getEffectiveTiers,
}))

describe("form upload token access", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getFormLimitsAsync.mockResolvedValue({
            forms: 3,
            submissionsPerMonth: 100,
            retentionDays: 30,
            removeBranding: false,
            customKey: false,
            maxSubmissionFileSize: 10_000,
            apiRequests: 500,
        })
        getEffectiveTiers.mockResolvedValue({ form: "plus" })
    })

    it("resolves a form-bound upload token to the form owner", async () => {
        getValidUploadTokenForRequest.mockResolvedValue({
            id: "token-1",
            dropId: "drop-1",
            formId: "form-1",
            expiresAt: new Date(Date.now() + 60_000),
        })
        formFindUnique.mockResolvedValue({
            id: "form-1",
            userId: "owner-1",
            allowFileUploads: true,
            active: true,
            disabledByUser: false,
            deletedAt: null,
            takenDown: false,
            closesAt: null,
        })
        dropFindUnique.mockResolvedValue({
            id: "drop-1",
            userId: "owner-1",
            deletedAt: null,
            takenDown: false,
        })

        const { resolveTokenUploadAccess } = await import("@/lib/services/form-upload")
        await expect(resolveTokenUploadAccess(new Request("http://localhost"), "drop-1")).resolves.toEqual({
            mode: "form",
            effectiveUserId: "owner-1",
            formId: "form-1",
        })
    })

    it("rejects form-bound tokens when the drop is not owned by the form creator", async () => {
        getValidUploadTokenForRequest.mockResolvedValue({
            id: "token-1",
            dropId: "drop-1",
            formId: "form-1",
            expiresAt: new Date(Date.now() + 60_000),
        })
        formFindUnique.mockResolvedValue({
            id: "form-1",
            userId: "owner-1",
            allowFileUploads: true,
            active: true,
            disabledByUser: false,
            deletedAt: null,
            takenDown: false,
            closesAt: null,
        })
        dropFindUnique.mockResolvedValue({
            id: "drop-1",
            userId: "owner-2",
            deletedAt: null,
            takenDown: false,
        })

        const { resolveTokenUploadAccess } = await import("@/lib/services/form-upload")
        await expect(resolveTokenUploadAccess(new Request("http://localhost"), "drop-1")).resolves.toBeNull()
    })

    it("rejects upload-token manifests above a file question max size", async () => {
        formFindUnique.mockResolvedValue({
            userId: "owner-1",
            schemaJson: JSON.stringify({
                version: 1,
                submitButtonText: "Submit",
                fields: [
                    {
                        id: "evidence",
                        type: "file",
                        label: "Evidence",
                        required: false,
                        maxFiles: 1,
                        maxFileSize: 1_000,
                    },
                ],
            }),
            maxFileSizeOverride: null,
        })

        const { validateFormUploadManifest } = await import("@/lib/services/form-upload")
        await expect(validateFormUploadManifest("form-1", [
            { fieldId: "evidence", size: 1_001, mimeType: "text/plain" },
        ])).rejects.toThrow('File exceeds the max size for "Evidence"')
    })

    it("rejects form drop file adds above a file question max size", async () => {
        formFindUnique.mockResolvedValue({
            userId: "owner-1",
            schemaJson: JSON.stringify({
                version: 1,
                submitButtonText: "Submit",
                fields: [
                    {
                        id: "evidence",
                        type: "file",
                        label: "Evidence",
                        required: false,
                        maxFiles: 1,
                        maxFileSize: 1_000,
                    },
                ],
            }),
            maxFileSizeOverride: null,
        })
        dropFileFindMany.mockResolvedValue([])

        const { validateFormDropFile } = await import("@/lib/services/form-upload")
        await expect(validateFormDropFile("form-1", {
            dropId: "drop-1",
            fieldId: "evidence",
            size: 1_017,
            mimeType: "text/plain",
            chunkCount: 1,
        })).rejects.toThrow('File exceeds the max size for "Evidence"')
    })

    it("uses form storage headroom for standalone form plans", async () => {
        const fiftyGb = 50 * 1024 * 1024 * 1024
        formFindUnique.mockResolvedValue({
            userId: "owner-1",
            maxFileSizeOverride: null,
        })
        getFormLimitsAsync.mockResolvedValue({
            forms: 30,
            submissionsPerMonth: 10_000,
            retentionDays: 365,
            removeBranding: true,
            customKey: true,
            maxSubmissionFileSize: fiftyGb,
            apiRequests: 100_000,
        })
        getEffectiveTiers.mockResolvedValue({ form: "pro", drop: "free" })

        const { getFormUploadQuotaOverride } = await import("@/lib/services/form-upload")
        await expect(getFormUploadQuotaOverride("form-1")).resolves.toEqual({
            maxFileSize: fiftyGb,
            storageLimit: BigInt(fiftyGb),
            currentTier: "pro",
        })
    })
})
