/**
 * @vitest-environment node
 *
 * Org-level policy for org vault key material: an org that enforces 2FA must
 * not hand key material to a member without 2FA, and a suspended (frozen) org
 * must reject key-material writes. getVaultSession alone only checks the
 * per-session 2FA challenge, not these org policies.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getVaultSession, enforceVaultRequestGuards, prisma } = vi.hoisted(() => ({
    getVaultSession: vi.fn(),
    enforceVaultRequestGuards: vi.fn(),
    prisma: {
        organization: { findUnique: vi.fn() },
        member: { findUnique: vi.fn(), findMany: vi.fn() },
        dropOwnerKey: { findUnique: vi.fn(), findMany: vi.fn() },
        organizationMemberKey: { findUnique: vi.fn(), upsert: vi.fn() },
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/vault/server", () => ({ getVaultSession }))
vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))
vi.mock("@/lib/vault/api", () => ({ logVaultError: vi.fn(), logVaultWarn: vi.fn() }))
vi.mock("@/lib/services/audit", () => ({ audit: vi.fn() }))

import { assertOrgVaultAccess, getMemberOrgIds } from "@/lib/vault/org-access"
import { GET as getDropKeys } from "@/app/api/vault/drop-keys/route"
import { GET as getOrgKey, POST as grantOrgKey } from "@/app/api/vault/org-keys/route"

beforeEach(() => {
    vi.clearAllMocks()
    enforceVaultRequestGuards.mockResolvedValue(null)
})

describe("assertOrgVaultAccess", () => {
    it("blocks a member without 2FA when the org enforces 2FA", async () => {
        prisma.organization.findUnique.mockResolvedValue({ enforce2FA: true, suspendedAt: null })
        const res = await assertOrgVaultAccess({
            user: { id: "u1", twoFactorEnabled: false },
            organizationId: "org-1",
            requestId: "r",
        })
        expect(res?.status).toBe(403)
    })

    it("allows a 2FA-enrolled member of a 2FA-enforcing org", async () => {
        prisma.organization.findUnique.mockResolvedValue({ enforce2FA: true, suspendedAt: null })
        expect(await assertOrgVaultAccess({
            user: { id: "u1", twoFactorEnabled: true },
            organizationId: "org-1",
            requestId: "r",
        })).toBeNull()
    })

    it("allows reads but rejects writes for a suspended org", async () => {
        prisma.organization.findUnique.mockResolvedValue({ enforce2FA: false, suspendedAt: new Date() })
        const params = { user: { id: "u1", twoFactorEnabled: true }, organizationId: "org-1", requestId: "r" }
        expect(await assertOrgVaultAccess(params)).toBeNull()
        expect((await assertOrgVaultAccess({ ...params, write: true }))?.status).toBe(403)
    })
})

describe("getMemberOrgIds policy filter", () => {
    it("excludes 2FA-enforcing orgs for a member without 2FA", async () => {
        prisma.member.findMany.mockResolvedValue([])
        await getMemberOrgIds("u1", { twoFactorEnabled: false })
        expect(prisma.member.findMany).toHaveBeenCalledWith({
            where: { userId: "u1", organization: { enforce2FA: false } },
            select: { organizationId: true },
        })
    })

    it("does not filter for a 2FA-enrolled member", async () => {
        prisma.member.findMany.mockResolvedValue([])
        await getMemberOrgIds("u1", { twoFactorEnabled: true })
        expect(prisma.member.findMany).toHaveBeenCalledWith({
            where: { userId: "u1" },
            select: { organizationId: true },
        })
    })
})

describe("vault routes apply the org policy", () => {
    it("drop-keys: withholds an org owner key from a member without 2FA in a 2FA-enforcing org", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1", twoFactorEnabled: false } })
        prisma.dropOwnerKey.findUnique.mockResolvedValue({
            userId: "u2", dropId: "d1", wrappedKey: "w", vaultGeneration: 1,
            organizationId: "org-1", orgKeyGeneration: 1,
        })
        prisma.member.findUnique.mockResolvedValue({ id: "m1" })
        prisma.organization.findUnique.mockResolvedValue({ enforce2FA: true, suspendedAt: null })

        const res = await getDropKeys(new Request("https://x/api/vault/drop-keys?dropId=d1"))
        expect(res.status).toBe(403)
    })

    it("org-keys GET: withholds the member key from a member without 2FA in a 2FA-enforcing org", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1", twoFactorEnabled: false } })
        prisma.member.findUnique.mockResolvedValue({ role: "member" })
        prisma.organizationMemberKey.findUnique.mockResolvedValue({ wrappedOrgVaultKey: "sealed", orgKeyGeneration: 1 })
        prisma.organization.findUnique.mockResolvedValue({ enforce2FA: true, suspendedAt: null, orgKeyGeneration: 1 })

        const res = await getOrgKey(new Request("https://x/api/vault/org-keys?organizationId=org-1"))
        expect(res.status).toBe(403)
        expect(JSON.stringify(await res.json())).not.toContain("sealed")
    })

    it("org-keys POST: rejects a grant in a suspended org", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1", twoFactorEnabled: true } })
        prisma.member.findUnique.mockResolvedValue({ role: "owner" })
        prisma.organization.findUnique.mockResolvedValue({ enforce2FA: false, suspendedAt: new Date(), orgKeyGeneration: 1 })

        const res = await grantOrgKey(new Request("https://x/api/vault/org-keys", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ organizationId: "org-1", targetUserId: "u2", wrappedOrgVaultKey: "sealed", orgKeyGeneration: 1 }),
        }))
        expect(res.status).toBe(403)
        expect(prisma.organizationMemberKey.upsert).not.toHaveBeenCalled()
    })
})
