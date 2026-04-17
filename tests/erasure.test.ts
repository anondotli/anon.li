import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    dropFindMany: vi.fn(),
    dropFileFindMany: vi.fn(),
    orphanedFileCreateMany: vi.fn(),
    deleteObjects: vi.fn(),
    deleteObject: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        drop: { findMany: mocks.dropFindMany },
        dropFile: { findMany: mocks.dropFileFindMany },
        orphanedFile: { createMany: mocks.orphanedFileCreateMany },
    },
}))

vi.mock("@/lib/storage", () => ({
    deleteObjects: mocks.deleteObjects,
    deleteObject: mocks.deleteObject,
}))

vi.mock("@/lib/logger", () => ({
    createLogger: vi.fn(() => ({ info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() })),
}))

import { eraseUserDrops } from "@/lib/services/erasure"

describe("eraseUserDrops", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("records partial batch deletion failures as orphaned files", async () => {
        mocks.dropFindMany.mockResolvedValue([{ id: "drop_1" }])
        mocks.dropFileFindMany.mockResolvedValue([
            { storageKey: "key_1", size: BigInt(1) },
            { storageKey: "key_2", size: BigInt(2) },
        ])
        mocks.deleteObjects.mockResolvedValue(["key_2"])
        mocks.orphanedFileCreateMany.mockResolvedValue({ count: 1 })

        await expect(eraseUserDrops("user_1")).resolves.toMatchObject({ failedKeys: 1 })

        expect(mocks.deleteObjects).toHaveBeenCalledWith(["key_1", "key_2"])
        expect(mocks.deleteObject).not.toHaveBeenCalled()
        expect(mocks.orphanedFileCreateMany).toHaveBeenCalledWith({
            data: [{ storageKey: "key_2" }],
        })
    })
})
