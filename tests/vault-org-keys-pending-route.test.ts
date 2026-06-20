/**
 * @vitest-environment node
 *
 * Server contract for the pending-grant endpoint (app/api/vault/org-keys/pending):
 * owner/admin gating, and that "pending" = members who published an identity
 * public key but hold no OrganizationMemberKey yet (their pubkeys returned for grant).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getVaultSession, enforceVaultRequestGuards, prisma } = vi.hoisted(() => ({
    getVaultSession: vi.fn(),
    enforceVaultRequestGuards: vi.fn(),
    prisma: {
        member: { findUnique: vi.fn(), findMany: vi.fn() },
        organization: { findUnique: vi.fn() },
        organizationMemberKey: { findMany: vi.fn() },
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/vault/server", () => ({ getVaultSession }))
vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))
vi.mock("@/lib/vault/api", () => ({ logVaultError: vi.fn(), logVaultWarn: vi.fn() }))

import { GET } from "@/app/api/vault/org-keys/pending/route"

const ORG = "org-1"
const getReq = (qs = `?organizationId=${ORG}`) => new Request(`https://x/api/vault/org-keys/pending${qs}`, { method: "GET" })

beforeEach(() => {
    vi.clearAllMocks()
    enforceVaultRequestGuards.mockResolvedValue(null)
    prisma.organization.findUnique.mockResolvedValue({ orgKeyGeneration: 1 })
})

describe("GET /api/vault/org-keys/pending", () => {
    it("401 when unauthenticated", async () => {
        getVaultSession.mockResolvedValue(null)
        expect((await GET(getReq())).status).toBe(401)
    })

    it("400 when organizationId is missing", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        expect((await GET(getReq(""))).status).toBe(400)
    })

    it("403 when the caller is not owner/admin", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.member.findUnique.mockResolvedValue({ role: "member" })
        expect((await GET(getReq())).status).toBe(403)
    })

    it("returns members with a published pubkey who hold no member key yet", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.member.findUnique.mockResolvedValue({ role: "admin" })
        prisma.member.findMany.mockResolvedValue([
            { userId: "u2", user: { security: { identityPublicKey: "PUBK2" } } },
            { userId: "u3", user: { security: { identityPublicKey: "PUBK3" } } },
        ])
        prisma.organizationMemberKey.findMany.mockResolvedValue([{ userId: "u3", orgKeyGeneration: 1 }]) // u3 already granted at current gen

        const res = await GET(getReq())
        expect(res.status).toBe(200)
        const json = await res.json()
        expect(json.data.pending).toEqual([{ userId: "u2", identityPublicKey: "PUBK2" }])
    })

    it("returns an empty list when everyone is already granted", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.member.findUnique.mockResolvedValue({ role: "owner" })
        prisma.member.findMany.mockResolvedValue([
            { userId: "u2", user: { security: { identityPublicKey: "PUBK2" } } },
        ])
        prisma.organizationMemberKey.findMany.mockResolvedValue([{ userId: "u2", orgKeyGeneration: 1 }])

        const res = await GET(getReq())
        expect(res.status).toBe(200)
        expect((await res.json()).data.pending).toEqual([])
    })
})
