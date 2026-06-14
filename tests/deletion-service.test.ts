import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    deletionRequestFindUnique: vi.fn(),
    deletionRequestUpdate: vi.fn(),
    deletionRequestFindMany: vi.fn(),
    deletionRequestUpsert: vi.fn(),
    deletionRequestDelete: vi.fn(),
    memberFindMany: vi.fn(),
    organizationFindMany: vi.fn(),
    userDelete: vi.fn(),
    aliasDeleteMany: vi.fn(),
    domainDeleteMany: vi.fn(),
    formDeleteMany: vi.fn(),
    dropDeleteMany: vi.fn(),
    sessionDeleteMany: vi.fn(),
    accountDeleteMany: vi.fn(),
    twoFactorDeleteMany: vi.fn(),
    dropOwnerKeyDeleteMany: vi.fn(),
    userSecurityDeleteMany: vi.fn(),
    apiKeyDeleteMany: vi.fn(),
    recipientDeleteMany: vi.fn(),
    subscriptionDeleteMany: vi.fn(),
    transaction: vi.fn(),
    eraseUserDrops: vi.fn(),
    getVaultSchemaState: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        deletionRequest: {
            findUnique: mocks.deletionRequestFindUnique,
            update: mocks.deletionRequestUpdate,
            findMany: mocks.deletionRequestFindMany,
            upsert: mocks.deletionRequestUpsert,
            delete: mocks.deletionRequestDelete,
        },
        member: { findMany: mocks.memberFindMany },
        organization: { findMany: mocks.organizationFindMany },
        user: { delete: mocks.userDelete },
        alias: { deleteMany: mocks.aliasDeleteMany },
        domain: { deleteMany: mocks.domainDeleteMany },
        form: { deleteMany: mocks.formDeleteMany },
        drop: { deleteMany: mocks.dropDeleteMany },
        session: { deleteMany: mocks.sessionDeleteMany },
        account: { deleteMany: mocks.accountDeleteMany },
        twoFactor: { deleteMany: mocks.twoFactorDeleteMany },
        dropOwnerKey: { deleteMany: mocks.dropOwnerKeyDeleteMany },
        userSecurity: { deleteMany: mocks.userSecurityDeleteMany },
        apiKey: { deleteMany: mocks.apiKeyDeleteMany },
        recipient: { deleteMany: mocks.recipientDeleteMany },
        subscription: { deleteMany: mocks.subscriptionDeleteMany },
        $transaction: mocks.transaction,
    },
}))

vi.mock("@/lib/services/erasure", () => ({
    eraseUserDrops: mocks.eraseUserDrops,
}))

vi.mock("@/lib/vault/schema", () => ({
    getVaultSchemaState: mocks.getVaultSchemaState,
}))

import { DeletionService } from "@/lib/services/deletion"

describe("DeletionService", () => {
    beforeEach(() => {
        vi.clearAllMocks()

        // Default: the user owns no organizations (sole-owner guard passes).
        mocks.memberFindMany.mockResolvedValue([])
        mocks.organizationFindMany.mockResolvedValue([])
        mocks.eraseUserDrops.mockResolvedValue({ failedKeys: 0 })
        mocks.getVaultSchemaState.mockResolvedValue({
            dropOwnerKeys: true,
            userSecurity: true,
        })
        mocks.deletionRequestUpdate.mockResolvedValue(undefined)
        mocks.deletionRequestFindMany.mockResolvedValue([])
        mocks.deletionRequestUpsert.mockResolvedValue({ id: "dr_123" })
        mocks.deletionRequestDelete.mockResolvedValue(undefined)
        mocks.userDelete.mockResolvedValue(undefined)
        mocks.aliasDeleteMany.mockResolvedValue({ count: 0 })
        mocks.domainDeleteMany.mockResolvedValue({ count: 0 })
        mocks.formDeleteMany.mockResolvedValue({ count: 0 })
        mocks.dropDeleteMany.mockResolvedValue({ count: 0 })
        mocks.sessionDeleteMany.mockResolvedValue({ count: 0 })
        mocks.accountDeleteMany.mockResolvedValue({ count: 0 })
        mocks.twoFactorDeleteMany.mockResolvedValue({ count: 0 })
        mocks.dropOwnerKeyDeleteMany.mockResolvedValue({ count: 0 })
        mocks.userSecurityDeleteMany.mockResolvedValue({ count: 0 })
        mocks.apiKeyDeleteMany.mockResolvedValue({ count: 0 })
        mocks.recipientDeleteMany.mockResolvedValue({ count: 0 })
        mocks.subscriptionDeleteMany.mockResolvedValue({ count: 0 })
        mocks.transaction.mockImplementation(async (operations: Promise<unknown>[]) => Promise.all(operations))
    })

    it("deletes auth material and marks active systems deleted", async () => {
        mocks.deletionRequestFindUnique.mockResolvedValue({
            id: "dr_123",
            userId: "user_123",
            status: "pending",
            aliasesDeleted: false,
            domainsDeleted: false,
            formsDeleted: false,
            storageDeleted: false,
            dropsDeleted: false,
            sessionsDeleted: false,
        })

        await DeletionService.processDeletion("dr_123")

        expect(mocks.accountDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123" } })
        expect(mocks.twoFactorDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123" } })
        expect(mocks.userSecurityDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123" } })
        // Personal-resource deletes are scoped to organizationId: null so a
        // member's account deletion never deletes the org's shared resources.
        expect(mocks.aliasDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123", organizationId: null } })
        expect(mocks.domainDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123", organizationId: null } })
        expect(mocks.formDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123", organizationId: null } })
        expect(mocks.dropDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123", organizationId: null } })
        expect(mocks.dropOwnerKeyDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123", organizationId: null } })
        expect(mocks.recipientDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123", organizationId: null } })
        expect(mocks.subscriptionDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123", organizationId: null } })
        expect(mocks.deletionRequestUpdate).toHaveBeenCalledWith({
            where: { id: "dr_123" },
            data: { status: "active_systems_deleted", completedAt: expect.any(Date) },
        })
    })

    it("hard-deletes the request row and user row immediately after cleanup", async () => {
        mocks.deletionRequestFindUnique.mockResolvedValue({
            id: "dr_123",
            userId: "user_123",
            status: "pending",
            aliasesDeleted: false,
            domainsDeleted: false,
            formsDeleted: false,
            storageDeleted: false,
            dropsDeleted: false,
            sessionsDeleted: true,
        })

        await expect(DeletionService.requestDeletion("user_123")).resolves.toBe("dr_123")

        expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123" } })
        expect(mocks.deletionRequestUpsert).toHaveBeenCalledWith({
            where: { userId: "user_123" },
            create: {
                userId: "user_123",
                status: "pending",
                sessionsDeleted: true,
            },
            update: {
                status: "pending",
                sessionsDeleted: true,
                completedAt: null,
            },
        })
        expect(mocks.deletionRequestDelete).toHaveBeenCalledWith({ where: { id: "dr_123" } })
        expect(mocks.userDelete).toHaveBeenCalledWith({ where: { id: "user_123" } })
    })
})
