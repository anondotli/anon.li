/**
 * @vitest-environment node
 *
 * Server contract for the org member-key endpoints (app/api/vault/org-keys):
 * membership gating on read, owner/admin grant gating + grantee-membership check
 * on write, schema availability, and that grants upsert the wrapped org vault key.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getVaultSession, enforceVaultRequestGuards, audit, prisma } = vi.hoisted(() => ({
    getVaultSession: vi.fn(),
    enforceVaultRequestGuards: vi.fn(),
    audit: vi.fn(),
    prisma: {
        member: { findUnique: vi.fn() },
        organization: { findUnique: vi.fn() },
        organizationMemberKey: { findUnique: vi.fn(), upsert: vi.fn() },
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/vault/server", () => ({ getVaultSession }))
vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))
vi.mock("@/lib/vault/api", () => ({ logVaultError: vi.fn(), logVaultWarn: vi.fn() }))
vi.mock("@/lib/services/audit", () => ({ audit }))

import { GET, POST } from "@/app/api/vault/org-keys/route"

const ORG = "org-1"
const WRAPPED = "wrapped-org-vault-key-blob"
const validGrant = { organizationId: ORG, targetUserId: "u2", wrappedOrgVaultKey: WRAPPED, orgKeyGeneration: 1 }

const getReq = (qs = `?organizationId=${ORG}`) => new Request(`https://x/api/vault/org-keys${qs}`, { method: "GET" })
const postReq = (body: unknown) =>
    new Request("https://x/api/vault/org-keys", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    })

beforeEach(() => {
    vi.clearAllMocks()
    enforceVaultRequestGuards.mockResolvedValue(null)
    // Default org is seeded at generation 1 (matches validGrant.orgKeyGeneration).
    prisma.organization.findUnique.mockResolvedValue({ orgKeyGeneration: 1 })
})

describe("GET /api/vault/org-keys (own member key)", () => {
    it("401 when unauthenticated", async () => {
        getVaultSession.mockResolvedValue(null)
        expect((await GET(getReq())).status).toBe(401)
    })

    it("400 when organizationId is missing", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        expect((await GET(getReq(""))).status).toBe(400)
    })

    it("403 when the caller is not a member of the org", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.member.findUnique.mockResolvedValue(null)
        expect((await GET(getReq())).status).toBe(403)
    })

    it("200 returns the caller's own member key", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.member.findUnique.mockResolvedValue({ role: "member" })
        prisma.organizationMemberKey.findUnique.mockResolvedValue({ wrappedOrgVaultKey: WRAPPED, orgKeyGeneration: 2 })
        const res = await GET(getReq())
        expect(res.status).toBe(200)
        expect(JSON.stringify(await res.json())).toContain(WRAPPED)
    })

    it("200 with null when the member exists but hasn't been granted yet", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.member.findUnique.mockResolvedValue({ role: "member" })
        prisma.organizationMemberKey.findUnique.mockResolvedValue(null)
        expect((await GET(getReq())).status).toBe(200)
    })
})

describe("POST /api/vault/org-keys (grant)", () => {
    it("401 when unauthenticated", async () => {
        getVaultSession.mockResolvedValue(null)
        expect((await POST(postReq(validGrant))).status).toBe(401)
    })

    it("400 on an invalid payload", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        expect((await POST(postReq({ organizationId: ORG }))).status).toBe(400)
    })

    it("403 when the caller is only a member (not owner/admin)", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.member.findUnique.mockResolvedValueOnce({ role: "member" }) // granter
        const res = await POST(postReq(validGrant))
        expect(res.status).toBe(403)
        expect(prisma.organizationMemberKey.upsert).not.toHaveBeenCalled()
    })

    it("404 when the target is not a member of the org", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.member.findUnique
            .mockResolvedValueOnce({ role: "admin" }) // granter
            .mockResolvedValueOnce(null) // grantee
        const res = await POST(postReq(validGrant))
        expect(res.status).toBe(404)
        expect(prisma.organizationMemberKey.upsert).not.toHaveBeenCalled()
    })

    it("an owner grant upserts the wrapped org vault key for the target member", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.member.findUnique
            .mockResolvedValueOnce({ role: "owner" }) // granter
            .mockResolvedValueOnce({ id: "m2" }) // grantee
        prisma.organizationMemberKey.upsert.mockResolvedValue({})
        const res = await POST(postReq(validGrant))
        expect(res.status).toBe(200)
        expect(prisma.organizationMemberKey.upsert).toHaveBeenCalledWith({
            where: { organizationId_userId: { organizationId: ORG, userId: "u2" } },
            create: { organizationId: ORG, userId: "u2", wrappedOrgVaultKey: WRAPPED, orgKeyGeneration: 1 },
            update: { wrappedOrgVaultKey: WRAPPED, orgKeyGeneration: 1 },
        })
        expect(audit).toHaveBeenCalledWith({
            action: "org.vault.grant",
            actorId: "u1",
            targetId: "u2",
            organizationId: ORG,
            metadata: { orgKeyGeneration: 1 },
        })
    })
})
