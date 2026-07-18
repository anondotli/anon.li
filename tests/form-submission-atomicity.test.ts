/** @vitest-environment node */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const {
    prisma,
    tx,
    getFormOwnerEntitlements,
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
            $transaction: vi.fn(async (callback: (client: typeof transactionClient) => unknown) => (
                callback(transactionClient)
            )),
        },
        getFormOwnerEntitlements: vi.fn(),
    }
})

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/services/form-entitlements", () => ({ getFormOwnerEntitlements }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { FormService } from "@/lib/services/form"

const schemaJson = JSON.stringify({
    version: 1,
    displayMode: "classic",
    submitButtonText: "Send",
    fields: [{ id: "message", type: "short_text", label: "Message", required: false }],
})

function formRow(overrides: Record<string, unknown> = {}) {
    return {
        id: "form-1",
        userId: "owner-1",
        organizationId: null,
        user: { banned: false, banFileUpload: false },
        organization: null,
        schemaJson,
        deletedAt: null,
        takenDown: false,
        active: true,
        disabledByUser: false,
        closesAt: null,
        maxSubmissions: 5,
        submissionsCount: 0,
        customKey: false,
        customKeyVerifier: null,
        allowFileUploads: false,
        maxFileSizeOverride: null,
        ...overrides,
    }
}

const payload = {
    ephemeralPubKey: "A".repeat(87),
    iv: "I".repeat(16),
    encryptedPayload: "ciphertext",
}

beforeEach(() => {
    vi.clearAllMocks()
    const initial = formRow()
    const live = formRow()
    prisma.form.findUnique.mockResolvedValue(initial)
    tx.form.findUnique.mockResolvedValue(live)
    tx.$queryRaw.mockResolvedValue([{ id: "locked" }])
    tx.$executeRaw.mockResolvedValue(1)
    tx.formUsageEvent.count.mockResolvedValue(0)
    tx.formSubmission.create.mockResolvedValue({
        id: "submission-1",
        formId: "form-1",
        createdAt: new Date("2026-07-15T12:00:00.000Z"),
    })
    tx.formUsageEvent.createMany.mockResolvedValue({ count: 0 })
    getFormOwnerEntitlements.mockResolvedValue({
        limits: {
            submissionsPerMonth: 50,
            retentionDays: 30,
            customKey: false,
            maxSubmissionFileSize: 100_000_000,
        },
        tiers: { form: "free", drop: "free" },
        subscribed: true,
    })
})

afterEach(() => vi.useRealTimers())

describe("FormService.recordSubmission atomic acceptance", () => {
    it("serializes owner usage, enforces the UTC month, and writes the durable ledger atomically", async () => {
        vi.useFakeTimers()
        vi.setSystemTime(new Date("2026-07-15T12:00:00.000Z"))

        await expect(FormService.recordSubmission("form-1", payload)).resolves.toMatchObject({
            id: "submission-1",
        })

        const lockSql = tx.$queryRaw.mock.calls
            .map((call) => (call[0] as TemplateStringsArray).join("?"))
            .find((sql) => sql.includes("pg_advisory_xact_lock"))
        expect(lockSql).toContain("pg_advisory_xact_lock")
        expect(tx.formUsageEvent.count).toHaveBeenCalledWith({
            where: {
                createdAt: { gte: new Date("2026-07-01T00:00:00.000Z") },
                userId: "owner-1",
                organizationId: null,
            },
        })

        const capSql = (tx.$executeRaw.mock.calls[0]?.[0] as TemplateStringsArray).join("?")
        expect(capSql).toContain('"maxSubmissions" IS NULL')
        expect(capSql).toContain('"submissionsCount" < "maxSubmissions"')
        expect(tx.formUsageEvent.createMany).toHaveBeenCalledWith({
            data: [{
                id: "submission-1",
                userId: "owner-1",
                organizationId: null,
                createdAt: new Date("2026-07-15T12:00:00.000Z"),
            }],
            skipDuplicates: true,
        })
    })

    it("rejects a password enabled by a concurrent builder edit before incrementing", async () => {
        tx.form.findUnique.mockResolvedValue(formRow({
            customKey: true,
            customKeyVerifier: "new-verifier",
        }))

        await expect(FormService.recordSubmission("form-1", payload))
            .rejects.toThrow("Form password verification required")
        expect(tx.$executeRaw).not.toHaveBeenCalled()
        expect(tx.formSubmission.create).not.toHaveBeenCalled()
        expect(tx.formUsageEvent.createMany).not.toHaveBeenCalled()
    })

    it("rejects a suspended target organization before opening a transaction", async () => {
        prisma.form.findUnique.mockResolvedValue(formRow({
            userId: null,
            organizationId: "org-1",
            user: null,
            organization: { suspendedAt: new Date() },
        }))

        await expect(FormService.recordSubmission("form-1", payload))
            .rejects.toThrow("Form owner is unavailable")
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it("allows a team member to save unchanged lifecycle fields", async () => {
        prisma.form.findUnique.mockResolvedValue(formRow({
            userId: "creator-1",
            organizationId: "org-1",
            disabledByUser: false,
        }))
        prisma.form.update.mockResolvedValue({ id: "form-1" })
        getFormOwnerEntitlements.mockResolvedValue({
            limits: {
                removeBranding: true,
                customKey: true,
                maxSubmissionFileSize: 1_000,
            },
            tiers: { form: "pro", drop: "pro" },
            subscribed: true,
        })

        await expect(FormService.updateForm(
            "form-1",
            { userId: "member-1", organizationId: "org-1", role: "member" },
            { title: "Edited", disabledByUser: false },
        )).resolves.toMatchObject({ id: "form-1" })
    })
})
