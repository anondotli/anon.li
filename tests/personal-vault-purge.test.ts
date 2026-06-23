import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    dropOwnerKeyDeleteMany: vi.fn(),
    userSecurityDeleteMany: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        dropOwnerKey: { deleteMany: mocks.dropOwnerKeyDeleteMany },
        userSecurity: { deleteMany: mocks.userSecurityDeleteMany },
    },
}))

import { purgePersonalVaultKeysOps } from "@/lib/vault/personal-purge"

describe("purgePersonalVaultKeysOps", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.dropOwnerKeyDeleteMany.mockReturnValue({ count: 0 })
        mocks.userSecurityDeleteMany.mockReturnValue({ count: 0 })
    })

    it("scopes the owner-key delete to PERSONAL keys, never org-owned ones", () => {
        // Regression guard: org-owned owner keys (organizationId set) are the sole
        // copy sealed to the org vault key. Deleting them by userId alone — as the
        // password-reset hook once did — permanently bricks the team's org drops.
        purgePersonalVaultKeysOps("user_123")

        expect(mocks.dropOwnerKeyDeleteMany).toHaveBeenCalledTimes(1)
        // The where clause MUST carry the organizationId: null guard — without it,
        // org-owned owner keys get deleted too and the team's drops are bricked.
        expect(mocks.dropOwnerKeyDeleteMany).toHaveBeenCalledWith({
            where: { userId: "user_123", organizationId: null },
        })
    })

    it("purges the user's personal userSecurity row", () => {
        purgePersonalVaultKeysOps("user_123")

        expect(mocks.userSecurityDeleteMany).toHaveBeenCalledTimes(1)
        expect(mocks.userSecurityDeleteMany).toHaveBeenCalledWith({
            where: { userId: "user_123" },
        })
    })

    it("returns both operations so callers can run them in one transaction", () => {
        const ops = purgePersonalVaultKeysOps("user_123")
        expect(ops).toHaveLength(2)
    })
})
