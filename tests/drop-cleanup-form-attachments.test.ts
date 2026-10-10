/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma } = vi.hoisted(() => ({
    prisma: {
        drop: { count: vi.fn(), findMany: vi.fn(), deleteMany: vi.fn() },
        orphanedFile: { create: vi.fn() },
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/storage", () => ({
    abortMultipartUpload: vi.fn(),
    deleteObject: vi.fn(),
    deleteObjects: vi.fn().mockResolvedValue([]),
}))
vi.mock("@/lib/services/drop-storage", () => ({
    deleteDropFileAndReleaseQuota: vi.fn(),
    deleteDropFilesAndReleaseQuota: vi.fn().mockResolvedValue({ files: [], deletedFiles: 0, releasedBytes: BigInt(0) }),
}))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() }),
}))

import { DropCleanupService } from "@/lib/services/drop-cleanup"

describe("DropCleanupService.cleanupExpiredDrops and Form attachments", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        prisma.drop.findMany.mockResolvedValue([])
        prisma.drop.count.mockResolvedValue(0)
    })

    it("never selects drops attached to a Form submission (FormCleanupService owns them)", async () => {
        await DropCleanupService.cleanupExpiredDrops()
        expect(prisma.drop.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({ formSubmission: null, deletedAt: null }),
        }))
    })

    it("applies the same exemption to the dry-run count", async () => {
        await DropCleanupService.cleanupExpiredDrops(true)
        expect(prisma.drop.count).toHaveBeenCalledWith({
            where: expect.objectContaining({ formSubmission: null }),
        })
    })
})
