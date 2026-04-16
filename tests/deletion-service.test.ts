import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    deletionRequestFindUnique: vi.fn(),
    deletionRequestUpdate: vi.fn(),
    deletionRequestFindMany: vi.fn(),
    aliasDeleteMany: vi.fn(),
    domainDeleteMany: vi.fn(),
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
        },
        alias: { deleteMany: mocks.aliasDeleteMany },
        domain: { deleteMany: mocks.domainDeleteMany },
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

        mocks.eraseUserDrops.mockResolvedValue({ failedKeys: 0 })
        mocks.getVaultSchemaState.mockResolvedValue({
            dropOwnerKeys: true,
            userSecurity: true,
        })
        mocks.deletionRequestUpdate.mockResolvedValue(undefined)
        mocks.deletionRequestFindMany.mockResolvedValue([])
        mocks.aliasDeleteMany.mockResolvedValue({ count: 0 })
        mocks.domainDeleteMany.mockResolvedValue({ count: 0 })
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

    it("deletes auth material and transitions into backup retention", async () => {
        mocks.deletionRequestFindUnique.mockResolvedValue({
            id: "dr_123",
            userId: "user_123",
            status: "pending",
            aliasesDeleted: false,
            domainsDeleted: false,
            storageDeleted: false,
            dropsDeleted: false,
            sessionsDeleted: false,
        })

        await DeletionService.processDeletion("dr_123")

        expect(mocks.accountDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123" } })
        expect(mocks.twoFactorDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123" } })
        expect(mocks.dropOwnerKeyDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123" } })
        expect(mocks.userSecurityDeleteMany).toHaveBeenCalledWith({ where: { userId: "user_123" } })
        expect(mocks.deletionRequestUpdate).toHaveBeenCalledWith({
            where: { id: "dr_123" },
            data: { status: "backup_retention" },
        })
    })
})
