/**
 * @vitest-environment node
 */
import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
    DropOwnerKeyConflictError,
    persistOwnedDropKey,
} from "@/lib/vault/drop-owner-keys"

const updateMany = vi.fn()
const create = vi.fn()
const findUnique = vi.fn()

const client = {
    dropOwnerKey: { updateMany, create, findUnique },
} as unknown as Parameters<typeof persistOwnedDropKey>[0]

beforeEach(() => {
    vi.clearAllMocks()
    updateMany.mockResolvedValue({ count: 1 })
    create.mockResolvedValue({})
    findUnique.mockResolvedValue(null)
})

describe("persistOwnedDropKey tenancy binding", () => {
    it("updates personal keys only in the explicit null-organization scope", async () => {
        await persistOwnedDropKey(client, "user-1", "drop-1", "wrapped", 4)

        expect(updateMany).toHaveBeenCalledWith({
            where: { dropId: "drop-1", userId: "user-1", organizationId: null },
            data: {
                wrappedKey: "wrapped",
                vaultGeneration: 4,
                organizationId: null,
                orgKeyGeneration: null,
            },
        })
    })

    it("updates organization keys by organization even after their creator is deleted", async () => {
        await persistOwnedDropKey(
            client,
            "member-2",
            "drop-1",
            "wrapped",
            4,
            { organizationId: "org-1", orgKeyGeneration: 8 },
        )

        expect(updateMany).toHaveBeenCalledWith({
            where: { dropId: "drop-1", organizationId: "org-1" },
            data: {
                wrappedKey: "wrapped",
                vaultGeneration: 4,
                organizationId: "org-1",
                orgKeyGeneration: 8,
            },
        })
    })

    it("does not recover a uniqueness race through another tenancy", async () => {
        updateMany.mockResolvedValueOnce({ count: 0 })
        create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed",
            { code: "P2002", clientVersion: "test" },
        ))
        findUnique.mockResolvedValueOnce({ userId: "user-1", organizationId: "org-2" })

        await expect(persistOwnedDropKey(
            client,
            "user-1",
            "drop-1",
            "wrapped",
            4,
        )).rejects.toBeInstanceOf(DropOwnerKeyConflictError)

        expect(updateMany).toHaveBeenCalledTimes(1)
    })

    it("preserves authoritative organization metadata on a same-scope race retry", async () => {
        updateMany
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 1 })
        create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed",
            { code: "P2002", clientVersion: "test" },
        ))
        findUnique.mockResolvedValueOnce({ userId: null, organizationId: "org-1" })

        await persistOwnedDropKey(
            client,
            "member-2",
            "drop-1",
            "wrapped",
            4,
            { organizationId: "org-1", orgKeyGeneration: 8 },
        )

        expect(updateMany).toHaveBeenLastCalledWith({
            where: { dropId: "drop-1", organizationId: "org-1" },
            data: {
                wrappedKey: "wrapped",
                vaultGeneration: 4,
                organizationId: "org-1",
                orgKeyGeneration: 8,
            },
        })
    })

    it("fails closed when the same-scope row disappears before the race retry", async () => {
        updateMany.mockResolvedValue({ count: 0 })
        create.mockRejectedValueOnce(new Prisma.PrismaClientKnownRequestError(
            "Unique constraint failed",
            { code: "P2002", clientVersion: "test" },
        ))
        findUnique.mockResolvedValueOnce({ userId: "user-1", organizationId: null })

        await expect(persistOwnedDropKey(
            client,
            "user-1",
            "drop-1",
            "wrapped",
            4,
        )).rejects.toBeInstanceOf(DropOwnerKeyConflictError)

        expect(updateMany).toHaveBeenCalledTimes(2)
    })
})
