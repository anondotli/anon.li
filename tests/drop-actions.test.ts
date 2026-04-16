/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const auth = vi.fn()
const rateLimit = vi.fn()
const createDrop = vi.fn()
const addFile = vi.fn()
const finishDrop = vi.fn()
const revalidatePath = vi.fn()
const getAuthUserState = vi.fn()

vi.mock("@/auth", () => ({
    auth,
}))

vi.mock("next/cache", () => ({
    revalidatePath,
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit,
    getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
    rateLimiters: {},
}))

vi.mock("@/lib/data/auth", () => ({
    getAuthUserState,
    getAuthApiKeyRecord: vi.fn().mockResolvedValue(null),
    touchApiKeyLastUsed: vi.fn().mockResolvedValue(undefined),
}))

vi.mock("@/lib/services/drop", () => ({
    DropService: {
        createDrop,
        addFile,
        finishDrop,
    },
}))

vi.mock("@/lib/storage", () => ({
    abortMultipartUpload: vi.fn(),
    getChunkPresignedUrls: vi.fn(),
    getPresignedDownloadUrl: vi.fn(),
}))

vi.mock("@/lib/drop-metadata", () => ({
    getPublicDropMetadata: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        userSecurity: {
            findUnique: vi.fn(),
        },
        dropOwnerKey: {
            updateMany: vi.fn(),
            create: vi.fn(),
            findUnique: vi.fn(),
        },
        drop: {
            deleteMany: vi.fn(),
            findUnique: vi.fn(),
        },
    },
}))

import { prisma } from "@/lib/prisma"

describe("createDropAction", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        auth.mockResolvedValue({ user: { id: "user-123" } })
        getAuthUserState.mockResolvedValue({ id: "user-123", banned: false })
        rateLimit.mockResolvedValue(null)
        createDrop.mockResolvedValue({
            dropId: "drop-123",
            expiresAt: new Date("2026-04-15T00:00:00.000Z"),
        })
        ;(prisma.userSecurity.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "cmau000000000000000000001",
            vaultGeneration: 3,
        })
        ;(prisma.dropOwnerKey.updateMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 0 })
        ;(prisma.dropOwnerKey.create as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({
            id: "owner-key-1",
        })
        ;(prisma.dropOwnerKey.findUnique as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)
        ;(prisma.drop.deleteMany as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ count: 1 })
    })

    it("stores the wrapped owner key as part of drop creation", async () => {
        const { createDropAction } = await import("@/actions/drop")

        const result = await createDropAction({
            iv: "1234567890123456",
            fileCount: 1,
            wrappedKey: "wrapped-key-material",
            vaultId: "cmau000000000000000000001",
            vaultGeneration: 3,
        })

        expect(createDrop).toHaveBeenCalledWith("user-123", expect.objectContaining({
            iv: "1234567890123456",
            fileCount: 1,
        }))
        expect(prisma.dropOwnerKey.updateMany).toHaveBeenCalledWith({
            where: {
                dropId: "drop-123",
                userId: "user-123",
            },
            data: {
                wrappedKey: "wrapped-key-material",
                vaultGeneration: 3,
            },
        })
        expect(prisma.dropOwnerKey.create).toHaveBeenCalledWith({
            data: {
                dropId: "drop-123",
                userId: "user-123",
                wrappedKey: "wrapped-key-material",
                vaultGeneration: 3,
            },
        })
        expect(result).toEqual({
            dropId: "drop-123",
            expiresAt: "2026-04-15T00:00:00.000Z",
        })
    })

    it("rolls back the incomplete drop when owner key persistence fails", async () => {
        ;(prisma.dropOwnerKey.create as unknown as ReturnType<typeof vi.fn>).mockRejectedValue(new Error("db failed"))

        const { createDropAction } = await import("@/actions/drop")

        const result = await createDropAction({
            iv: "1234567890123456",
            fileCount: 1,
            wrappedKey: "wrapped-key-material",
            vaultId: "cmau000000000000000000001",
            vaultGeneration: 3,
        })

        expect(prisma.drop.deleteMany).toHaveBeenCalledWith({
            where: {
                id: "drop-123",
                userId: "user-123",
                uploadComplete: false,
            },
        })
        expect(result).toEqual({
            error: "Failed to store drop encryption key",
        })
    })
})
