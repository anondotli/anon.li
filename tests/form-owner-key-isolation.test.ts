/**
 * @vitest-environment node
 */
import { Prisma } from "@prisma/client"
import { beforeEach, describe, expect, it, vi } from "vitest"

import {
    FormOwnerKeyConflictError,
    persistOwnedFormKey,
} from "@/lib/vault/form-owner-keys"

const updateMany = vi.fn()
const create = vi.fn()
const findUnique = vi.fn()

const client = {
    formOwnerKey: { updateMany, create, findUnique },
} as unknown as Parameters<typeof persistOwnedFormKey>[0]

function uniqueConstraintError() {
    return new Prisma.PrismaClientKnownRequestError(
        "Unique constraint failed",
        { code: "P2002", clientVersion: "test" },
    )
}

beforeEach(() => {
    vi.clearAllMocks()
    updateMany.mockResolvedValue({ count: 1 })
    create.mockResolvedValue({})
    findUnique.mockResolvedValue(null)
})

describe("persistOwnedFormKey tenancy binding", () => {
    it("updates personal keys only in the explicit null-organization scope", async () => {
        await persistOwnedFormKey(client, "user-1", "form-1", "wrapped", 4)

        expect(updateMany).toHaveBeenCalledWith({
            where: { formId: "form-1", userId: "user-1", organizationId: null },
            data: {
                wrappedKey: "wrapped",
                vaultGeneration: 4,
                organizationId: null,
                orgKeyGeneration: null,
            },
        })
    })

    it("updates organization keys by organization after their creator is deleted", async () => {
        await persistOwnedFormKey(
            client,
            "member-2",
            "form-1",
            "wrapped",
            4,
            { organizationId: "org-1", orgKeyGeneration: 8 },
        )

        expect(updateMany).toHaveBeenCalledWith({
            where: { formId: "form-1", organizationId: "org-1" },
            data: {
                wrappedKey: "wrapped",
                vaultGeneration: 4,
                organizationId: "org-1",
                orgKeyGeneration: 8,
            },
        })
    })

    it("creates organization keys with the shared-vault binding used by FormService", async () => {
        updateMany.mockResolvedValueOnce({ count: 0 })

        await persistOwnedFormKey(
            client,
            "creator-1",
            "form-1",
            "wrapped",
            4,
            { organizationId: "org-1", orgKeyGeneration: 8 },
        )

        expect(create).toHaveBeenCalledWith({
            data: {
                userId: "creator-1",
                formId: "form-1",
                wrappedKey: "wrapped",
                vaultGeneration: 4,
                organizationId: "org-1",
                orgKeyGeneration: 8,
            },
        })
    })

    it("does not recover a uniqueness race through another tenancy", async () => {
        updateMany.mockResolvedValueOnce({ count: 0 })
        create.mockRejectedValueOnce(uniqueConstraintError())
        findUnique.mockResolvedValueOnce({ userId: "user-1", organizationId: "org-2" })

        await expect(persistOwnedFormKey(
            client,
            "user-1",
            "form-1",
            "wrapped",
            4,
        )).rejects.toBeInstanceOf(FormOwnerKeyConflictError)

        expect(updateMany).toHaveBeenCalledTimes(1)
    })

    it("preserves authoritative organization metadata on a same-scope race retry", async () => {
        updateMany
            .mockResolvedValueOnce({ count: 0 })
            .mockResolvedValueOnce({ count: 1 })
        create.mockRejectedValueOnce(uniqueConstraintError())
        findUnique.mockResolvedValueOnce({ userId: null, organizationId: "org-1" })

        await persistOwnedFormKey(
            client,
            "member-2",
            "form-1",
            "wrapped",
            4,
            { organizationId: "org-1", orgKeyGeneration: 8 },
        )

        expect(updateMany).toHaveBeenLastCalledWith({
            where: { formId: "form-1", organizationId: "org-1" },
            data: {
                wrappedKey: "wrapped",
                vaultGeneration: 4,
                organizationId: "org-1",
                orgKeyGeneration: 8,
            },
        })
    })

    it("reports a conflict if the raced row disappears before the scoped retry", async () => {
        updateMany.mockResolvedValueOnce({ count: 0 }).mockResolvedValueOnce({ count: 0 })
        create.mockRejectedValueOnce(uniqueConstraintError())
        findUnique.mockResolvedValueOnce({ userId: "user-1", organizationId: null })

        await expect(persistOwnedFormKey(
            client,
            "user-1",
            "form-1",
            "wrapped",
            4,
        )).rejects.toBeInstanceOf(FormOwnerKeyConflictError)
    })
})
