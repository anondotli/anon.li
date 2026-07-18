/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

vi.mock("@/lib/prisma", () => ({
    prisma: {
        $executeRaw: vi.fn(),
        $queryRaw: vi.fn(),
        $transaction: vi.fn(),
    },
}))

import { prisma } from "@/lib/prisma"
import {
    deleteDropFileAndReleaseQuota,
    deleteDropFilesAndReleaseQuota,
    deletePendingDropFileAndReleaseQuota,
    deleteStaleUploadFilesAndReleaseQuota,
} from "@/lib/services/drop-storage"

beforeEach(() => {
    vi.clearAllMocks()
    ;(prisma.$transaction as ReturnType<typeof vi.fn>).mockImplementation(
        async (callback: (tx: unknown) => unknown) => callback(prisma),
    )
})

describe("deleteDropFileAndReleaseQuota", () => {
    it("reports only the caller that atomically claimed a file", async () => {
        (prisma.$queryRaw as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce([{ storageKey: "key-1", s3UploadId: "upload-1", size: BigInt(300) }])
            .mockResolvedValueOnce([])

        await expect(deleteDropFileAndReleaseQuota("file-1")).resolves.toEqual({
            storageKey: "key-1",
            s3UploadId: "upload-1",
            size: BigInt(300),
        })
        await expect(deleteDropFileAndReleaseQuota("file-1")).resolves.toBeNull()
    })

    it("derives the quota owner from the parent drop in SQL", async () => {
        (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([
            { storageKey: "org-key", s3UploadId: null, size: BigInt(1) },
        ])

        await expect(deleteDropFileAndReleaseQuota("org-file")).resolves.toEqual({
            storageKey: "org-key",
            s3UploadId: null,
            size: BigInt(1),
        })

        const sql = ((prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as TemplateStringsArray).join("?")
        expect(sql).toContain('FROM deleted_file, "drops" AS parent')
        expect(sql).toContain('owner."id" = parent."userId"')
    })
})

describe("deletePendingDropFileAndReleaseQuota", () => {
    it("claims only a file that is still pending", async () => {
        (prisma.$queryRaw as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce([
                { storageKey: "pending-key", s3UploadId: "pending-upload", size: BigInt(40) },
            ])
            .mockResolvedValueOnce([])

        await expect(deletePendingDropFileAndReleaseQuota("file-1")).resolves.toEqual({
            storageKey: "pending-key",
            s3UploadId: "pending-upload",
            size: BigInt(40),
        })
        await expect(deletePendingDropFileAndReleaseQuota("file-1")).resolves.toBeNull()

        const sql = ((prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as TemplateStringsArray).join("?")
        expect(sql).toContain('AND "uploadComplete" = FALSE')
        expect(sql).toContain('RETURNING "dropId", "storageKey", "s3UploadId", "size"')
    })
})

describe("deleteDropFilesAndReleaseQuota", () => {
    it("reports only rows claimed by each whole-drop deletion attempt", async () => {
        (prisma.$queryRaw as ReturnType<typeof vi.fn>)
            .mockResolvedValueOnce([{ id: "drop-1", userId: "user-1" }])
            .mockResolvedValueOnce([
                { storageKey: "key-1", s3UploadId: "upload-1", size: BigInt(100) },
                { storageKey: "key-2", s3UploadId: null, size: BigInt(200) },
            ])
            .mockResolvedValueOnce([{ id: "drop-1", userId: "user-1" }])
            .mockResolvedValueOnce([])

        await expect(deleteDropFilesAndReleaseQuota("drop-1")).resolves.toEqual({
            files: [
                { storageKey: "key-1", s3UploadId: "upload-1", size: BigInt(100) },
                { storageKey: "key-2", s3UploadId: null, size: BigInt(200) },
            ],
            deletedFiles: 2,
            releasedBytes: BigInt(300),
        })
        await expect(deleteDropFilesAndReleaseQuota("drop-1")).resolves.toEqual({
            files: [],
            deletedFiles: 0,
            releasedBytes: BigInt(0),
        })

        const parentSql = ((prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] as TemplateStringsArray).join("?")
        const childSql = ((prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[1]?.[0] as TemplateStringsArray).join("?")
        expect(parentSql).toContain('UPDATE "drops"')
        expect(parentSql).toContain('SET "deletedAt" = COALESCE("deletedAt", NOW())')
        expect(childSql).toContain('DELETE FROM "drop_files"')
        expect(childSql).toContain('RETURNING "storageKey", "s3UploadId", "size"')
        expect(prisma.$executeRaw).toHaveBeenCalledTimes(1)
        expect(prisma.$transaction).toHaveBeenCalledWith(
            expect.any(Function),
            { isolationLevel: "ReadCommitted" },
        )
    })

    it("returns a no-op result when no row is returned", async () => {
        (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([])

        await expect(deleteDropFilesAndReleaseQuota("already-deleted")).resolves.toEqual({
            files: [],
            deletedFiles: 0,
            releasedBytes: BigInt(0),
        })
        expect(prisma.$queryRaw).toHaveBeenCalledTimes(1)
        expect(prisma.$executeRaw).not.toHaveBeenCalled()
    })
})

describe("deleteStaleUploadFilesAndReleaseQuota", () => {
    it("rechecks the staging marker, live token, and accepted-submission guard under the Drop lock", async () => {
        (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValue([])

        await expect(deleteStaleUploadFilesAndReleaseQuota(
            "staging-drop",
            new Date("2026-07-15T00:00:00.000Z"),
            new Date("2026-07-15T06:00:00.000Z"),
        )).resolves.toBeNull()

        const call = (prisma.$queryRaw as ReturnType<typeof vi.fn>).mock.calls[0]
        const guard = call?.[2] as { strings: string[] }
        const guardSql = guard.strings.join("?")
        expect(guardSql).toContain('target."form_staging_id" IS NOT NULL')
        expect(guardSql).toContain('FROM "form_submissions" AS submission')
        expect(guardSql).toContain('submission."attachedDropId" = target."id"')
        expect(guardSql).toContain('token."expiresAt" >')
    })
})
