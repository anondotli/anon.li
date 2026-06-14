/**
 * @vitest-environment node
 *
 * Server contract for the org-key ROTATION endpoint (app/api/vault/org-keys/rekey).
 * The POST performs the atomic re-key (ORG-E2EE §6): a single-winner generation
 * bump (conditional on the prior generation), a re-grant to every CURRENT member
 * (forged userIds are filtered out), a re-wrap of every org-owned Drop/Form owner
 * key, and clearing the "rotation recommended" marker — all in ONE transaction.
 * A lost generation race must 409, and only owner/admin may rotate.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getVaultSession, enforceVaultRequestGuards, getVaultSchemaState, audit, prisma } = vi.hoisted(() => ({
    getVaultSession: vi.fn(),
    enforceVaultRequestGuards: vi.fn(),
    getVaultSchemaState: vi.fn(),
    audit: vi.fn(),
    prisma: {
        member: { findUnique: vi.fn(), findMany: vi.fn() },
        organization: { updateMany: vi.fn() },
        organizationMemberKey: { upsert: vi.fn() },
        dropOwnerKey: { updateMany: vi.fn() },
        formOwnerKey: { updateMany: vi.fn() },
        $transaction: vi.fn(),
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/vault/server", () => ({ getVaultSession }))
vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))
vi.mock("@/lib/vault/schema", () => ({ getVaultSchemaState, VAULT_SCHEMA_UNAVAILABLE_MESSAGE: "Vault schema unavailable" }))
vi.mock("@/lib/vault/api", () => ({ logVaultError: vi.fn(), logVaultWarn: vi.fn() }))
vi.mock("@/lib/services/audit", () => ({ audit }))

import { POST } from "@/app/api/vault/org-keys/rekey/route"

const ORG = "org-1"

// Rotating from generation 1 -> 2. memberGrants includes a forged "ghost" who is
// NOT a current member, so it must be filtered out before the re-grant.
const body = {
    organizationId: ORG,
    orgKeyGeneration: 2,
    memberGrants: [
        { userId: "owner-1", wrappedOrgVaultKey: "sealed-owner" },
        { userId: "u2", wrappedOrgVaultKey: "sealed-u2" },
        { userId: "ghost", wrappedOrgVaultKey: "sealed-ghost" },
    ],
    dropKeys: [{ id: "d1", wrappedKey: "rewrapped-d1" }],
    formKeys: [{ id: "f1", wrappedKey: "rewrapped-f1" }],
}

const postReq = (b: unknown) =>
    new Request("https://x/api/vault/org-keys/rekey", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(b),
    })

// Run the transaction callback against a tx that proxies to the mocked prisma.
function runTx(impl: (tx: typeof prisma) => Promise<unknown>) {
    return impl(prisma)
}

beforeEach(() => {
    vi.clearAllMocks()
    enforceVaultRequestGuards.mockResolvedValue(null)
    getVaultSchemaState.mockResolvedValue({ organizationMemberKeys: true, dropOwnerKeys: true, formOwnerKeys: true })
    getVaultSession.mockResolvedValue({ user: { id: "owner-1" } })
    prisma.member.findUnique.mockResolvedValue({ role: "owner" })
    prisma.member.findMany.mockResolvedValue([{ userId: "owner-1" }, { userId: "u2" }])
    prisma.organization.updateMany.mockResolvedValue({ count: 1 })
    prisma.organizationMemberKey.upsert.mockResolvedValue({})
    prisma.dropOwnerKey.updateMany.mockResolvedValue({ count: 1 })
    prisma.formOwnerKey.updateMany.mockResolvedValue({ count: 1 })
    prisma.$transaction.mockImplementation(runTx)
})

describe("POST /api/vault/org-keys/rekey", () => {
    it("401 when unauthenticated", async () => {
        getVaultSession.mockResolvedValue(null)
        expect((await POST(postReq(body))).status).toBe(401)
    })

    it("403 when the caller is only a member", async () => {
        prisma.member.findUnique.mockResolvedValue({ role: "member" })
        const res = await POST(postReq(body))
        expect(res.status).toBe(403)
        expect(prisma.organization.updateMany).not.toHaveBeenCalled()
    })

    it("400 on an invalid body", async () => {
        expect((await POST(postReq({}))).status).toBe(400)
    })

    it("rotates atomically: bumps the generation, clears the marker, re-grants and re-wraps, audits", async () => {
        const res = await POST(postReq(body))
        expect(res.status).toBe(200)

        // Single-winner generation bump conditional on the PRIOR generation, and
        // the recommendation marker is cleared in the same write.
        expect(prisma.organization.updateMany).toHaveBeenCalledWith({
            where: { id: ORG, orgKeyGeneration: 1 },
            data: { orgKeyGeneration: 2, keyRotationRecommendedAt: null },
        })

        // Re-grant only to current members — the forged "ghost" grant is dropped.
        expect(prisma.organizationMemberKey.upsert).toHaveBeenCalledTimes(2)
        const grantedUserIds = prisma.organizationMemberKey.upsert.mock.calls.map(
            (c) => (c[0] as { where: { organizationId_userId: { userId: string } } }).where.organizationId_userId.userId,
        )
        expect(grantedUserIds).toEqual(expect.arrayContaining(["owner-1", "u2"]))
        expect(grantedUserIds).not.toContain("ghost")

        // Owner keys re-wrapped at the new generation, scoped to the org.
        expect(prisma.dropOwnerKey.updateMany).toHaveBeenCalledWith({
            where: { dropId: "d1", organizationId: ORG },
            data: { wrappedKey: "rewrapped-d1", orgKeyGeneration: 2 },
        })
        expect(prisma.formOwnerKey.updateMany).toHaveBeenCalledWith({
            where: { formId: "f1", organizationId: ORG },
            data: { wrappedKey: "rewrapped-f1", orgKeyGeneration: 2 },
        })

        expect(audit).toHaveBeenCalledWith(expect.objectContaining({ action: "org.vault.rotate", organizationId: ORG }))
    })

    it("409 when the generation bump loses a concurrent race (stale generation)", async () => {
        prisma.organization.updateMany.mockResolvedValue({ count: 0 })
        const res = await POST(postReq(body))
        expect(res.status).toBe(409)
        expect(prisma.organizationMemberKey.upsert).not.toHaveBeenCalled()
        expect(audit).not.toHaveBeenCalled()
    })
})
