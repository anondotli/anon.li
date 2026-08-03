/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getSession, isEnabled } = vi.hoisted(() => ({
    getSession: vi.fn(),
    isEnabled: vi.fn(),
}))

vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers()) }))
vi.mock("@/lib/auth", () => ({ auth: { api: { getSession } } }))
vi.mock("@/lib/services/two-factor", () => ({
    TwoFactorService: { isEnabled },
}))
vi.mock("@/lib/prisma", () => ({
    prisma: { account: { findFirst: vi.fn() } },
}))

import { getVaultSession } from "@/lib/vault/server"

function session(overrides: Record<string, unknown> = {}) {
    return {
        session: {
            id: "session-1",
            createdAt: new Date(),
            twoFactorVerified: true,
        },
        user: {
            id: "user-1",
            email: "user@example.com",
            name: "User",
            banned: false,
            ...overrides,
        },
    }
}

describe("getVaultSession", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        isEnabled.mockResolvedValue(false)
    })

    it("rejects a currently banned user even if an older session cookie remains", async () => {
        getSession.mockResolvedValue(session({ banned: true }))

        await expect(getVaultSession()).resolves.toBeNull()
        expect(isEnabled).not.toHaveBeenCalled()
    })

    it("returns an eligible session after resolving current 2FA state", async () => {
        getSession.mockResolvedValue(session())

        await expect(getVaultSession()).resolves.toMatchObject({
            user: { id: "user-1", twoFactorEnabled: false },
            session: { id: "session-1", twoFactorVerified: true },
        })
        expect(isEnabled).toHaveBeenCalledWith("user-1")
    })
})
