/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"

const {
    submissionFindMany,
    submissionDelete,
    formFindMany,
    usageCount,
    usageDeleteMany,
    getFormOwnerEntitlements,
} = vi.hoisted(() => ({
    submissionFindMany: vi.fn(),
    submissionDelete: vi.fn(),
    formFindMany: vi.fn(),
    usageCount: vi.fn(),
    usageDeleteMany: vi.fn(),
    getFormOwnerEntitlements: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        formSubmission: {
            findMany: submissionFindMany,
            delete: submissionDelete,
        },
        form: { findMany: formFindMany },
        formUsageEvent: {
            count: usageCount,
            deleteMany: usageDeleteMany,
        },
    },
}))
vi.mock("@/lib/services/form-entitlements", () => ({ getFormOwnerEntitlements }))
vi.mock("@/lib/services/drop", () => ({ DropService: { deleteDrop: vi.fn() } }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() }),
}))

import { FormCleanupService } from "@/lib/services/form-cleanup"

const DAY_MS = 24 * 60 * 60 * 1000

function candidate() {
    return {
        id: "submission-1",
        formId: "form-1",
        createdAt: new Date(Date.now() - 60 * DAY_MS),
        attachedDropId: null,
    }
}

function personalForm(downgradedAt: Date | null = null) {
    return {
        id: "form-1",
        userId: "owner-1",
        organizationId: null,
        user: { downgradedAt, subscriptions: [] },
        organization: null,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    submissionFindMany.mockResolvedValue([candidate()])
    formFindMany.mockResolvedValue([personalForm()])
    submissionDelete.mockResolvedValue({})
    getFormOwnerEntitlements.mockResolvedValue({
        limits: { retentionDays: 30 },
        tiers: { form: "free", drop: "free" },
        subscribed: true,
    })
})

describe("FormCleanupService retention safety", () => {
    it("fails closed when authoritative entitlements cannot be resolved", async () => {
        getFormOwnerEntitlements.mockRejectedValue(new Error("database unavailable"))

        await expect(FormCleanupService.cleanupExpiredSubmissions()).resolves.toEqual({
            found: 1,
            deleted: 0,
            errors: [],
        })
        expect(submissionDelete).not.toHaveBeenCalled()
    })

    it("does not apply Free retention to a lapsed org until a grace deadline exists", async () => {
        formFindMany.mockResolvedValue([{
            id: "form-1",
            userId: null,
            organizationId: "org-1",
            user: null,
            organization: { formRetentionGraceUntil: null },
        }])
        getFormOwnerEntitlements.mockResolvedValue({
            limits: { retentionDays: 30 },
            tiers: { form: "free", drop: "free" },
            subscribed: false,
        })

        await FormCleanupService.cleanupExpiredSubmissions()
        expect(submissionDelete).not.toHaveBeenCalled()
    })

    it("honors the full fourteen-day personal downgrade grace", async () => {
        formFindMany.mockResolvedValue([
            personalForm(new Date(Date.now() - 10 * DAY_MS)),
        ])

        await FormCleanupService.cleanupExpiredSubmissions()
        expect(submissionDelete).not.toHaveBeenCalled()
    })

    it("fails closed when a personal paid row lapsed before reconciliation", async () => {
        formFindMany.mockResolvedValue([{
            ...personalForm(),
            user: {
                downgradedAt: null,
                subscriptions: [{ currentPeriodEnd: new Date(Date.now() - 2 * DAY_MS) }],
            },
        }])

        await FormCleanupService.cleanupExpiredSubmissions()
        expect(submissionDelete).not.toHaveBeenCalled()
    })

    it("prunes content-free quota identifiers after ninety days", async () => {
        usageCount.mockResolvedValue(4)
        usageDeleteMany.mockResolvedValue({ count: 4 })

        await expect(FormCleanupService.cleanupOldUsageEvents()).resolves.toEqual({
            found: 4,
            deleted: 4,
            errors: [],
        })
        expect(usageDeleteMany).toHaveBeenCalledWith({
            where: { createdAt: { lt: expect.any(Date) } },
        })
    })
})
