import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { AdminService } from "@/lib/services/admin"
import { prisma } from "@/lib/prisma"

const requestDeletion = vi.fn()
const processDeletion = vi.fn()
const completeDeletion = vi.fn()
const cleanupOrphanedFiles = vi.fn()

vi.mock("resend", () => ({
    Resend: class {
        emails = { send: vi.fn() }
    },
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: {
            findUnique: vi.fn(),
            delete: vi.fn(),
        },
        deletionRequest: {
            findUnique: vi.fn(),
        },
    },
}))

vi.mock("@/lib/services/deletion", () => ({
    DeletionService: {
        requestDeletion,
        processDeletion,
        completeDeletion,
    },
}))

vi.mock("@/lib/services/drop-cleanup", () => ({
    DropCleanupService: {
        cleanupOrphanedFiles,
    },
}))

describe("AdminService production operations", () => {
    const prismaMock = prisma as unknown as {
        user: { findUnique: Mock; delete: Mock }
        deletionRequest: { findUnique: Mock }
    }

    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("deletes users through the immediate deletion service", async () => {
        prismaMock.user.findUnique.mockResolvedValue({ id: "user_1" })
        requestDeletion.mockResolvedValue("dr_1")

        const result = await AdminService.deleteUser("user_1")

        expect(requestDeletion).toHaveBeenCalledWith("user_1")
        expect(prismaMock.user.delete).not.toHaveBeenCalled()
        expect(result).toEqual({ success: true, requestId: "dr_1" })
    })

    it("retries non-completed deletion requests and completes them immediately", async () => {
        prismaMock.deletionRequest.findUnique.mockResolvedValue({ id: "dr_1", status: "pending" })
        processDeletion.mockResolvedValue(undefined)
        completeDeletion.mockResolvedValue(undefined)

        await expect(AdminService.processDeletionRequest("dr_1")).resolves.toEqual({ success: true })

        expect(processDeletion).toHaveBeenCalledWith("dr_1")
        expect(completeDeletion).toHaveBeenCalledWith("dr_1")
    })

    it("delegates orphaned storage cleanup to the existing cleanup pipeline", async () => {
        cleanupOrphanedFiles.mockResolvedValue({ found: 2, deleted: 2, errors: [] })

        await expect(AdminService.cleanupOrphanedFiles()).resolves.toEqual({ found: 2, deleted: 2, errors: [] })

        expect(cleanupOrphanedFiles).toHaveBeenCalledWith(false)
    })
})
