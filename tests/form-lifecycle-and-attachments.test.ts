/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
    prisma,
    tx,
    getFormOwnerEntitlements,
    deleteDrop,
} = vi.hoisted(() => {
    const transactionClient = {
        $queryRaw: vi.fn(),
        $executeRaw: vi.fn(),
        form: { findUnique: vi.fn() },
        formUsageEvent: { count: vi.fn(), createMany: vi.fn() },
        formSubmission: { create: vi.fn() },
        uploadToken: { deleteMany: vi.fn() },
        drop: { findUnique: vi.fn(), updateMany: vi.fn() },
    }
    return {
        tx: transactionClient,
        prisma: {
            form: { findUnique: vi.fn(), update: vi.fn() },
            formUsageEvent: { count: vi.fn() },
            uploadToken: { findUnique: vi.fn(), deleteMany: vi.fn() },
            drop: { findUnique: vi.fn() },
            $transaction: vi.fn(async (callback: (client: typeof transactionClient) => unknown) => (
                callback(transactionClient)
            )),
        },
        getFormOwnerEntitlements: vi.fn(),
        deleteDrop: vi.fn(),
    }
})

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/services/form-entitlements", () => ({ getFormOwnerEntitlements }))
vi.mock("@/lib/services/drop", () => ({ DropService: { deleteDrop } }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { FormService } from "@/lib/services/form"
import { revokeFormStagingUpload } from "@/lib/services/form-upload"
import { hashUploadToken } from "@/lib/services/drop-upload-token"

const schemaJson = JSON.stringify({
    version: 1,
    title: "Form",
    displayMode: "classic",
    submitButtonText: "Send",
    fields: [
        { id: "message", type: "short_text", label: "Message", required: false },
        { id: "upload", type: "file", label: "Upload", required: false, maxFiles: 2 },
    ],
})

function formRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "form-1",
        userId: "creator-1",
        organizationId: "org-1",
        user: { banned: false, banFileUpload: false },
        organization: { suspendedAt: null },
        title: "Form",
        description: null,
        schemaJson,
        publicKey: "public-key",
        deletedAt: null,
        takenDown: false,
        active: true,
        disabledByUser: false,
        closesAt: new Date("2026-12-01T10:00:30.000Z"),
        maxSubmissions: 50,
        submissionsCount: 0,
        hideBranding: false,
        customKey: false,
        customKeyVerifier: null,
        salt: null,
        customKeyData: null,
        customKeyIv: null,
        allowFileUploads: true,
        maxFileSizeOverride: null,
        notifyEmailFallback: true,
        ...overrides,
    }
}

const member = { userId: "member-1", organizationId: "org-1", role: "member" as const }
const admin = { userId: "admin-1", organizationId: "org-1", role: "admin" as const }

beforeEach(() => {
    vi.clearAllMocks()
    prisma.form.findUnique.mockResolvedValue(formRow())
    prisma.form.update.mockResolvedValue({ id: "form-1" })
    prisma.formUsageEvent.count.mockResolvedValue(0)
    getFormOwnerEntitlements.mockResolvedValue({
        limits: {
            removeBranding: true,
            customKey: true,
            maxSubmissionFileSize: 100_000_000,
            submissionsPerMonth: 100,
            retentionDays: 30,
        },
        tiers: { form: "pro", drop: "pro" },
        subscribed: true,
    })
})

afterEach(() => vi.useRealTimers())

describe("FormService.updateForm lifecycle permissions", () => {
    it.each([
        ["closes the form early", { closesAt: "2026-01-01T00:00:00.000Z" }],
        ["removes the close date", { closesAt: null }],
        ["lowers the submission cap", { maxSubmissions: 1 }],
        ["enables a password", {
            customKey: true,
            salt: "S".repeat(43),
            customKeyData: "x".repeat(80),
            customKeyIv: "I".repeat(16),
            customKeyVerifier: "V".repeat(43),
        }],
    ])("rejects a plain team member who %s", async (_label, input) => {
        await expect(FormService.updateForm("form-1", member, input))
            .rejects.toThrow("Insufficient organization role")
        expect(prisma.form.update).not.toHaveBeenCalled()
    })

    it("rejects a member rotating an existing password", async () => {
        prisma.form.findUnique.mockResolvedValue(formRow({ customKey: true, customKeyVerifier: "old" }))
        await expect(FormService.updateForm("form-1", member, {
            customKey: true,
            salt: "S".repeat(43),
            customKeyData: "x".repeat(80),
            customKeyIv: "I".repeat(16),
            customKeyVerifier: "V".repeat(43),
        })).rejects.toThrow("Insufficient organization role")
    })

    it("lets a member re-save unchanged lifecycle values (close date round-tripped to the minute)", async () => {
        await expect(FormService.updateForm("form-1", member, {
            title: "Edited",
            closesAt: "2026-12-01T10:00:00.000Z",
            maxSubmissions: 50,
            disabledByUser: false,
        })).resolves.toMatchObject({ id: "form-1" })
    })

    it("lets an admin change lifecycle values", async () => {
        await expect(FormService.updateForm("form-1", admin, {
            closesAt: "2026-01-01T00:00:00.000Z",
            maxSubmissions: 1,
        })).resolves.toMatchObject({ id: "form-1" })
    })
})

describe("FormService.getPublicForm availability", () => {
    it("renders a form at its submission cap as closed", async () => {
        prisma.form.findUnique.mockResolvedValue(formRow({ maxSubmissions: 3, submissionsCount: 3 }))
        await expect(FormService.getPublicForm("form-1")).resolves.toMatchObject({ active: false })
    })

    it("renders a form whose owner hit the monthly cap as closed", async () => {
        prisma.formUsageEvent.count.mockResolvedValue(100)
        await expect(FormService.getPublicForm("form-1")).resolves.toMatchObject({ active: false })
        expect(prisma.formUsageEvent.count).toHaveBeenCalledWith({
            where: expect.objectContaining({ organizationId: "org-1" }),
        })
    })

    it("stays open under both caps and skips the count for unlimited plans", async () => {
        await expect(FormService.getPublicForm("form-1")).resolves.toMatchObject({ active: true })

        prisma.formUsageEvent.count.mockClear()
        getFormOwnerEntitlements.mockResolvedValue({
            limits: { removeBranding: true, customKey: true, submissionsPerMonth: -1 },
            tiers: { form: "pro", drop: "pro" },
            subscribed: true,
        })
        await expect(FormService.getPublicForm("form-1")).resolves.toMatchObject({ active: true })
        expect(prisma.formUsageEvent.count).not.toHaveBeenCalled()
    })
})

describe("FormService.recordSubmission attachment lifetime", () => {
    it("clears the staging drop's expiry so the submission owns its lifetime", async () => {
        const personal = formRow({ userId: "owner-1", organizationId: null, organization: null })
        prisma.form.findUnique.mockResolvedValue(personal)
        tx.form.findUnique.mockResolvedValue(personal)
        tx.$queryRaw.mockResolvedValue([{ id: "locked" }])
        tx.$executeRaw.mockResolvedValue(1)
        tx.formUsageEvent.count.mockResolvedValue(0)
        tx.formUsageEvent.createMany.mockResolvedValue({ count: 1 })
        tx.uploadToken.deleteMany.mockResolvedValue({ count: 1 })
        tx.drop.findUnique.mockResolvedValue({
            id: "drop-1",
            userId: "owner-1",
            organizationId: null,
            deletedAt: null,
            takenDown: false,
            disabled: false,
            formStagingId: "form-1",
            uploadComplete: true,
            formSubmission: null,
            files: [{ id: "file-1", size: BigInt(100), mimeType: "text/plain", chunkCount: 1, uploadComplete: true }],
        })
        tx.drop.updateMany.mockResolvedValue({ count: 1 })
        tx.formSubmission.create.mockResolvedValue({ id: "submission-1", createdAt: new Date() })

        await FormService.recordSubmission("form-1", {
            ephemeralPubKey: "A".repeat(87),
            iv: "I".repeat(16),
            encryptedPayload: "ciphertext",
            attachedDropId: "drop-1",
            attachmentUploadToken: "T".repeat(43),
            attachmentManifest: [{ fieldId: "upload", fileId: "file-1", size: 100, mimeType: "text/plain" }],
        })

        expect(tx.drop.updateMany).toHaveBeenCalledWith(expect.objectContaining({
            data: { expiresAt: null, formStagingId: null },
        }))
    })
})

describe("revokeFormStagingUpload", () => {
    const rawToken = "R".repeat(43)

    it("revokes the token first, then deletes the still-staged drop as its owner", async () => {
        prisma.uploadToken.findUnique.mockResolvedValue({ dropId: "drop-1", formId: "form-1" })
        prisma.uploadToken.deleteMany.mockResolvedValue({ count: 1 })
        prisma.drop.findUnique.mockResolvedValue({
            id: "drop-1",
            userId: "creator-1",
            organizationId: "org-1",
            formStagingId: "form-1",
            deletedAt: null,
            formSubmission: null,
        })

        await expect(revokeFormStagingUpload("form-1", rawToken)).resolves.toBe(true)

        expect(prisma.uploadToken.deleteMany).toHaveBeenCalledWith({
            where: { tokenHash: hashUploadToken(rawToken), formId: "form-1", dropId: "drop-1" },
        })
        expect(deleteDrop).toHaveBeenCalledWith("drop-1", {
            userId: "creator-1",
            organizationId: "org-1",
            role: "owner",
        })
        const tokenOrder = prisma.uploadToken.deleteMany.mock.invocationCallOrder[0] ?? 0
        const dropOrder = deleteDrop.mock.invocationCallOrder[0] ?? 0
        expect(tokenOrder).toBeLessThan(dropOrder)
    })

    it("never deletes a drop whose token a submission already consumed", async () => {
        prisma.uploadToken.findUnique.mockResolvedValue({ dropId: "drop-1", formId: "form-1" })
        prisma.uploadToken.deleteMany.mockResolvedValue({ count: 0 })

        await expect(revokeFormStagingUpload("form-1", rawToken)).resolves.toBe(false)
        expect(deleteDrop).not.toHaveBeenCalled()
    })

    it("refuses a token bound to another form or malformed", async () => {
        prisma.uploadToken.findUnique.mockResolvedValue({ dropId: "drop-1", formId: "form-2" })
        await expect(revokeFormStagingUpload("form-1", rawToken)).resolves.toBe(false)
        await expect(revokeFormStagingUpload("form-1", "short")).resolves.toBe(false)
        expect(prisma.uploadToken.deleteMany).not.toHaveBeenCalled()
        expect(deleteDrop).not.toHaveBeenCalled()
    })

    it("leaves a drop that is already attached to a submission alone", async () => {
        prisma.uploadToken.findUnique.mockResolvedValue({ dropId: "drop-1", formId: "form-1" })
        prisma.uploadToken.deleteMany.mockResolvedValue({ count: 1 })
        prisma.drop.findUnique.mockResolvedValue({
            id: "drop-1",
            userId: "creator-1",
            organizationId: null,
            formStagingId: null,
            deletedAt: null,
            formSubmission: { id: "submission-1" },
        })

        await expect(revokeFormStagingUpload("form-1", rawToken)).resolves.toBe(true)
        expect(deleteDrop).not.toHaveBeenCalled()
    })
})
