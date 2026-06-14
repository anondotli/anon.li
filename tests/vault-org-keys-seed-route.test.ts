/**
 * @vitest-environment node
 *
 * Server contract for the org-key SEED endpoint (app/api/vault/org-keys/seed):
 * owner/admin gating, and SINGLE-WINNER seeding — the conditional generation
 * bump (0 -> 1) means a concurrent second seeder loses with a 409 instead of
 * establishing a second, conflicting org vault key (split-brain).
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getVaultSession, enforceVaultRequestGuards, getVaultSchemaState, audit, prisma } = vi.hoisted(() => ({
    getVaultSession: vi.fn(),
    enforceVaultRequestGuards: vi.fn(),
    getVaultSchemaState: vi.fn(),
    audit: vi.fn(),
    prisma: {
        member: { findUnique: vi.fn() },
        organization: { updateMany: vi.fn() },
        organizationMemberKey: { create: vi.fn(), findFirst: vi.fn() },
        $transaction: vi.fn(),
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/vault/server", () => ({ getVaultSession }))
vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))
vi.mock("@/lib/vault/schema", () => ({ getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE: "Vault schema unavailable" }))
vi.mock("@/lib/vault/api", () => ({ logVaultError: vi.fn(), logVaultWarn: vi.fn() }))
vi.mock("@/lib/services/audit", () => ({ audit }))
vi.mock("@prisma/client", () => ({ Prisma: { PrismaClientKnownRequestError: class extends Error { code = "" } } }))

import { POST } from "@/app/api/vault/org-keys/seed/route"

const ORG = "org-1"
const body = { organizationId: ORG, wrappedOrgVaultKey: "sealed-blob" }
const postReq = (b: unknown) =>
    new Request("https://x/api/vault/org-keys/seed", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(b) })

// Run the transaction callback against a tx that proxies to the mocked prisma.
function runTx(impl: (tx: typeof prisma) => Promise<unknown>) {
    return impl(prisma)
}

beforeEach(() => {
    vi.clearAllMocks()
    enforceVaultRequestGuards.mockResolvedValue(null)
    getVaultSchemaState.mockResolvedValue({ organizationMemberKeys: true })
    getVaultSession.mockResolvedValue({ user: { id: "owner-1" } })
    prisma.member.findUnique.mockResolvedValue({ role: "owner" })
    prisma.$transaction.mockImplementation(runTx)
    prisma.organizationMemberKey.create.mockResolvedValue({})
    // Default: no key distributed yet -> genuine unseeded seed path.
    prisma.organizationMemberKey.findFirst.mockResolvedValue(null)
})

describe("POST /api/vault/org-keys/seed", () => {
    it("401 when unauthenticated", async () => {
        getVaultSession.mockResolvedValue(null)
        expect((await POST(postReq(body))).status).toBe(401)
    })

    it("403 when the caller is only a member", async () => {
        prisma.member.findUnique.mockResolvedValue({ role: "member" })
        expect((await POST(postReq(body))).status).toBe(403)
    })

    it("seeds at generation 1 when the org is unseeded (winner)", async () => {
        prisma.organization.updateMany.mockResolvedValue({ count: 1 }) // 0 -> 1 won
        const res = await POST(postReq(body))
        expect(res.status).toBe(200)
        expect(prisma.organization.updateMany).toHaveBeenCalledWith({
            where: { id: ORG, orgKeyGeneration: 0 },
            data: { orgKeyGeneration: 1 },
        })
        expect(prisma.organizationMemberKey.create).toHaveBeenCalled()
    })

    it("409 single-winner: a concurrent second seeder loses (already seeded)", async () => {
        prisma.organization.updateMany.mockResolvedValue({ count: 0 }) // someone else already bumped 0 -> 1
        const res = await POST(postReq(body))
        expect(res.status).toBe(409)
        expect(prisma.organizationMemberKey.create).not.toHaveBeenCalled()
    })

    it("409 + no new key when keys already exist (never mints a second org vault key)", async () => {
        prisma.organizationMemberKey.findFirst.mockResolvedValue({ orgKeyGeneration: 1 })
        prisma.organization.updateMany.mockResolvedValue({ count: 0 }) // org already at gen 1, nothing to repair
        const res = await POST(postReq(body))
        expect(res.status).toBe(409)
        expect(prisma.$transaction).not.toHaveBeenCalled()
        expect(prisma.organizationMemberKey.create).not.toHaveBeenCalled()
    })

    it("self-heals a lagging org generation: keys at gen N but org at 0 -> repairs to N and 409s", async () => {
        // The inconsistent state behind the seed/409 loop: distributed keys at
        // gen 1 while organizations.org_key_generation is still 0.
        prisma.organizationMemberKey.findFirst.mockResolvedValue({ orgKeyGeneration: 1 })
        prisma.organization.updateMany.mockResolvedValue({ count: 1 })
        const res = await POST(postReq(body))
        expect(res.status).toBe(409)
        // Generation raised up to the highest distributed key, never lowered.
        expect(prisma.organization.updateMany).toHaveBeenCalledWith({
            where: { id: ORG, orgKeyGeneration: { lt: 1 } },
            data: { orgKeyGeneration: 1 },
        })
        // Crucially: no second key minted, no single-winner transaction run.
        expect(prisma.$transaction).not.toHaveBeenCalled()
        expect(prisma.organizationMemberKey.create).not.toHaveBeenCalled()
    })
})
