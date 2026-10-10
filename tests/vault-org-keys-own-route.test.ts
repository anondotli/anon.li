/**
 * @vitest-environment node
 *
 * DELETE /api/vault/org-keys/own — a member releases their OWN unopenable org
 * member key so they become "pending" for re-grant. Compare-and-delete on the
 * exact grant the client failed to open; never anyone else's row; never the
 * last current-generation grant of the org.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { hashCiphertext } from "@/lib/vault/ciphertext-hash"

const { getVaultSession, enforceVaultRequestGuards, prisma } = vi.hoisted(() => ({
    getVaultSession: vi.fn(),
    enforceVaultRequestGuards: vi.fn(),
    prisma: {
        organization: { findUnique: vi.fn() },
        organizationMemberKey: { findUnique: vi.fn(), count: vi.fn(), deleteMany: vi.fn() },
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/vault/server", () => ({ getVaultSession }))
vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))
vi.mock("@/lib/vault/api", () => ({ logVaultError: vi.fn(), logVaultWarn: vi.fn() }))

import { DELETE } from "@/app/api/vault/org-keys/own/route"

const SEALED = "sealed-grant-ciphertext"
let HASH: string

async function del(overrides: Record<string, string | undefined> = {}) {
    const params = new URLSearchParams()
    const values = { organizationId: "org-1", orgKeyGeneration: "2", wrappedKeyHash: HASH, ...overrides }
    for (const [k, v] of Object.entries(values)) if (v !== undefined) params.set(k, v)
    return DELETE(new Request(`https://x/api/vault/org-keys/own?${params.toString()}`, { method: "DELETE" }))
}

beforeEach(async () => {
    vi.clearAllMocks()
    HASH = await hashCiphertext(SEALED)
    enforceVaultRequestGuards.mockResolvedValue(null)
    getVaultSession.mockResolvedValue({ user: { id: "u1", twoFactorEnabled: false } })
    // Both the policy lookup and the generation lookup read the org row.
    prisma.organization.findUnique.mockResolvedValue({ enforce2FA: false, suspendedAt: null, orgKeyGeneration: 2 })
    prisma.organizationMemberKey.findUnique.mockResolvedValue({ wrappedOrgVaultKey: SEALED, orgKeyGeneration: 2 })
    prisma.organizationMemberKey.count.mockResolvedValue(1) // someone else holds the current key
    prisma.organizationMemberKey.deleteMany.mockResolvedValue({ count: 1 })
})

describe("DELETE /api/vault/org-keys/own", () => {
    it("401 without a vault session (incl. an unverified 2FA session)", async () => {
        getVaultSession.mockResolvedValue(null)
        expect((await del()).status).toBe(401)
        expect(prisma.organizationMemberKey.deleteMany).not.toHaveBeenCalled()
    })

    it("runs the CSRF + rate-limit guards and honors a block", async () => {
        const blocked = new Response("blocked", { status: 403 })
        enforceVaultRequestGuards.mockResolvedValue(blocked)

        expect(await del()).toBe(blocked)
        expect(enforceVaultRequestGuards).toHaveBeenCalledWith(expect.objectContaining({ csrf: true, identifier: "u1" }))
        expect(prisma.organizationMemberKey.deleteMany).not.toHaveBeenCalled()
    })

    it("deletes ONLY the session user's exact verified row, ignoring any userId in the request", async () => {
        const res = await del({ userId: "victim", targetUserId: "victim" })

        expect(res.status).toBe(200)
        expect(prisma.organizationMemberKey.findUnique).toHaveBeenCalledWith({
            where: { organizationId_userId: { organizationId: "org-1", userId: "u1" } },
            select: { wrappedOrgVaultKey: true, orgKeyGeneration: true },
        })
        expect(prisma.organizationMemberKey.deleteMany).toHaveBeenCalledWith({
            where: { organizationId: "org-1", userId: "u1", orgKeyGeneration: 2, wrappedOrgVaultKey: SEALED },
        })
    })

    it("409 and keeps the row when the grant's hash no longer matches (re-granted meanwhile)", async () => {
        prisma.organizationMemberKey.findUnique.mockResolvedValue({ wrappedOrgVaultKey: "newer-grant", orgKeyGeneration: 2 })
        const res = await del()
        expect(res.status).toBe(409)
        expect((await res.json()).error.code).toBe("CONFLICT")
        expect(prisma.organizationMemberKey.deleteMany).not.toHaveBeenCalled()
    })

    it("409 and keeps the row when the generation doesn't match", async () => {
        expect((await del({ orgKeyGeneration: "1" })).status).toBe(409)
        expect(prisma.organizationMemberKey.deleteMany).not.toHaveBeenCalled()
    })

    it("409 ORG_KEY_LAST_HOLDER and keeps the row when nobody else holds the current key", async () => {
        prisma.organizationMemberKey.count.mockResolvedValue(0)
        const res = await del()
        expect(res.status).toBe(409)
        expect((await res.json()).error.code).toBe("ORG_KEY_LAST_HOLDER")
        expect(prisma.organizationMemberKey.count).toHaveBeenCalledWith({
            where: { organizationId: "org-1", userId: { not: "u1" }, orgKeyGeneration: { gte: 2 } },
        })
        expect(prisma.organizationMemberKey.deleteMany).not.toHaveBeenCalled()
    })

    it("releases a stale-generation grant without the last-holder check", async () => {
        prisma.organizationMemberKey.findUnique.mockResolvedValue({ wrappedOrgVaultKey: SEALED, orgKeyGeneration: 1 })
        prisma.organizationMemberKey.count.mockResolvedValue(0)
        expect((await del({ orgKeyGeneration: "1" })).status).toBe(200)
        expect(prisma.organizationMemberKey.count).not.toHaveBeenCalled()
        expect(prisma.organizationMemberKey.deleteMany).toHaveBeenCalled()
    })

    it("200 no-op when there is no grant", async () => {
        prisma.organizationMemberKey.findUnique.mockResolvedValue(null)
        const res = await del()
        expect(res.status).toBe(200)
        expect(prisma.organizationMemberKey.deleteMany).not.toHaveBeenCalled()
    })

    it.each([
        ["a missing organizationId", { organizationId: undefined }],
        ["a missing hash", { wrappedKeyHash: undefined }],
        ["a malformed hash", { wrappedKeyHash: "abc" }],
        ["a non-numeric generation", { orgKeyGeneration: "x" }],
    ])("400 on %s", async (_name, overrides) => {
        expect((await del(overrides)).status).toBe(400)
        expect(prisma.organizationMemberKey.deleteMany).not.toHaveBeenCalled()
    })

    it("403 when the org enforces 2FA and the caller has none", async () => {
        prisma.organization.findUnique.mockResolvedValue({ enforce2FA: true, suspendedAt: null, orgKeyGeneration: 2 })
        expect((await del()).status).toBe(403)
        expect(prisma.organizationMemberKey.deleteMany).not.toHaveBeenCalled()
    })
})
