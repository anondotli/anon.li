/**
 * @vitest-environment node
 *
 * Server contract for the org-key ROTATION endpoint (app/api/vault/org-keys/rekey).
 * The POST performs the atomic re-key (ORG-E2EE §6): a single-winner generation
 * bump (conditional on the prior generation), an exact re-grant to every CURRENT
 * member, a re-wrap of every org-owned Drop/Form owner key, and clearing the
 * "rotation recommended" marker — all in ONE transaction. Stale/incomplete
 * payloads and lost update races must roll the transaction back and return 409.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getVaultSession, enforceVaultRequestGuards, audit, prisma } = vi.hoisted(() => ({
    getVaultSession: vi.fn(),
    enforceVaultRequestGuards: vi.fn(),
    audit: vi.fn(),
    prisma: {
        member: { findUnique: vi.fn(), findMany: vi.fn() },
        organization: { updateMany: vi.fn() },
        organizationMemberKey: { upsert: vi.fn() },
        dropOwnerKey: { findMany: vi.fn(), updateMany: vi.fn() },
        formOwnerKey: { findMany: vi.fn(), updateMany: vi.fn() },
        $transaction: vi.fn(),
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/vault/server", () => ({ getVaultSession }))
vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))
vi.mock("@/lib/vault/api", () => ({ logVaultError: vi.fn(), logVaultWarn: vi.fn() }))
vi.mock("@/lib/services/audit", () => ({ audit }))

import { POST } from "@/app/api/vault/org-keys/rekey/route"

const ORG = "org-1"

// Rotating from generation 1 -> 2. Every list exactly matches the authoritative
// rows returned from the transaction by default.
const body = {
    organizationId: ORG,
    orgKeyGeneration: 2,
    memberGrants: [
        { userId: "owner-1", wrappedOrgVaultKey: "sealed-owner" },
        { userId: "u2", wrappedOrgVaultKey: "sealed-u2" },
    ],
    dropKeys: [
        { id: "d1", wrappedKey: "rewrapped-d1" },
        { id: "d2", wrappedKey: "rewrapped-d2" },
    ],
    formKeys: [
        { id: "f1", wrappedKey: "rewrapped-f1" },
        { id: "f2", wrappedKey: "rewrapped-f2" },
    ],
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
    getVaultSession.mockResolvedValue({ user: { id: "owner-1" } })
    prisma.member.findUnique.mockResolvedValue({ role: "owner" })
    prisma.member.findMany.mockResolvedValue([{ userId: "owner-1" }, { userId: "u2" }])
    prisma.organization.updateMany.mockResolvedValue({ count: 1 })
    prisma.organizationMemberKey.upsert.mockResolvedValue({})
    prisma.dropOwnerKey.findMany.mockResolvedValue([{ dropId: "d1" }, { dropId: "d2" }])
    prisma.dropOwnerKey.updateMany.mockResolvedValue({ count: 1 })
    prisma.formOwnerKey.findMany.mockResolvedValue([{ formId: "f1" }, { formId: "f2" }])
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

    it("400 on an empty item id", async () => {
        const res = await POST(postReq({
            ...body,
            dropKeys: [{ id: "", wrappedKey: "rewrapped" }],
        }))
        expect(res.status).toBe(400)
        expect(prisma.organization.updateMany).not.toHaveBeenCalled()
    })

    it("413 with an explicit error when the atomic payload exceeds the byte limit", async () => {
        const req = postReq(body)
        req.headers.set("content-length", String(16 * 1024 * 1024 + 1))

        const res = await POST(req)
        const payload = await res.json()

        expect(res.status).toBe(413)
        expect(payload.error.message).toContain("16 MiB")
        expect(prisma.$transaction).not.toHaveBeenCalled()
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

        expect(prisma.$transaction).toHaveBeenCalledWith(expect.any(Function), { isolationLevel: "Serializable" })
        expect(prisma.member.findMany).toHaveBeenCalledWith({
            where: {
                organizationId: ORG,
                user: { security: { identityPublicKey: { not: null } } },
            },
            select: { userId: true },
        })
        expect(prisma.dropOwnerKey.findMany).toHaveBeenCalledWith({
            where: { organizationId: ORG },
            select: { dropId: true },
        })
        expect(prisma.formOwnerKey.findMany).toHaveBeenCalledWith({
            where: { organizationId: ORG },
            select: { formId: true },
        })

        // Re-grant every current member exactly once.
        expect(prisma.organizationMemberKey.upsert).toHaveBeenCalledTimes(2)
        const grantedUserIds = prisma.organizationMemberKey.upsert.mock.calls.map(
            (c) => (c[0] as { where: { organizationId_userId: { userId: string } } }).where.organizationId_userId.userId,
        )
        expect(grantedUserIds).toEqual(expect.arrayContaining(["owner-1", "u2"]))

        // Owner keys re-wrapped at the new generation, scoped to the org.
        expect(prisma.dropOwnerKey.updateMany).toHaveBeenCalledTimes(2)
        expect(prisma.dropOwnerKey.updateMany).toHaveBeenCalledWith({
            where: { dropId: "d1", organizationId: ORG },
            data: { wrappedKey: "rewrapped-d1", orgKeyGeneration: 2 },
        })
        expect(prisma.formOwnerKey.updateMany).toHaveBeenCalledTimes(2)
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

    it.each([
        ["an empty member list", { ...body, memberGrants: [] }],
        ["a missing member id", { ...body, memberGrants: body.memberGrants.slice(0, 1) }],
        ["a duplicate member id", { ...body, memberGrants: [...body.memberGrants, body.memberGrants[0]] }],
        ["an extra member id", {
            ...body,
            memberGrants: [...body.memberGrants, { userId: "ghost", wrappedOrgVaultKey: "sealed-ghost" }],
        }],
        ["a missing Drop id", { ...body, dropKeys: body.dropKeys.slice(0, 1) }],
        ["a duplicate Drop id", { ...body, dropKeys: [...body.dropKeys, body.dropKeys[0]] }],
        ["an extra Drop id", {
            ...body,
            dropKeys: [...body.dropKeys, { id: "other-org-drop", wrappedKey: "forged" }],
        }],
        ["a missing Form id", { ...body, formKeys: body.formKeys.slice(0, 1) }],
        ["a duplicate Form id", { ...body, formKeys: [...body.formKeys, body.formKeys[0]] }],
        ["an extra Form id", {
            ...body,
            formKeys: [...body.formKeys, { id: "other-org-form", wrappedKey: "forged" }],
        }],
    ])("409 without writes or audit for %s", async (_label, mismatchedBody) => {
        const res = await POST(postReq(mismatchedBody))
        const payload = await res.json()

        expect(res.status).toBe(409)
        expect(payload.error.code).toBe("CONFLICT")
        // The bump ran in the transaction, but throwing here makes Prisma roll it
        // back together with keyRotationRecommendedAt: null.
        expect(prisma.organization.updateMany).toHaveBeenCalledTimes(1)
        expect(prisma.organizationMemberKey.upsert).not.toHaveBeenCalled()
        expect(prisma.dropOwnerKey.updateMany).not.toHaveBeenCalled()
        expect(prisma.formOwnerKey.updateMany).not.toHaveBeenCalled()
        expect(audit).not.toHaveBeenCalled()
    })

    it("rolls back the generation and preserves the recommendation marker when an owner-key update misses", async () => {
        const recommendedAt = new Date("2026-01-02T03:04:05.000Z")
        let organization = {
            orgKeyGeneration: 1,
            keyRotationRecommendedAt: recommendedAt as Date | null,
        }

        prisma.organization.updateMany.mockImplementation(async () => {
            organization = { orgKeyGeneration: 2, keyRotationRecommendedAt: null }
            return { count: 1 }
        })
        prisma.dropOwnerKey.updateMany
            .mockResolvedValueOnce({ count: 1 })
            .mockResolvedValueOnce({ count: 0 })
        prisma.$transaction.mockImplementation(async (impl: (tx: typeof prisma) => Promise<unknown>) => {
            const snapshot = { ...organization }
            try {
                return await impl(prisma)
            } catch (error) {
                organization = snapshot
                throw error
            }
        })

        const res = await POST(postReq(body))

        expect(res.status).toBe(409)
        expect(organization).toEqual({
            orgKeyGeneration: 1,
            keyRotationRecommendedAt: recommendedAt,
        })
        expect(prisma.formOwnerKey.updateMany).not.toHaveBeenCalled()
        expect(audit).not.toHaveBeenCalled()
    })

    it("409 and rolls back when a Form owner-key update misses", async () => {
        prisma.formOwnerKey.updateMany.mockResolvedValueOnce({ count: 0 })

        const res = await POST(postReq(body))

        expect(res.status).toBe(409)
        expect(prisma.formOwnerKey.updateMany).toHaveBeenCalledTimes(1)
        expect(audit).not.toHaveBeenCalled()
    })

    it("accepts payload lists beyond the former 10,000-item schema cap", async () => {
        const memberGrants = Array.from({ length: 10_001 }, (_, index) => ({
            userId: `user-${index}`,
            wrappedOrgVaultKey: `sealed-${index}`,
        }))
        // Stop at the generation guard: reaching it proves schema validation no
        // longer rejects a complete large-org payload solely for its item count.
        prisma.organization.updateMany.mockResolvedValue({ count: 0 })

        const res = await POST(postReq({ ...body, memberGrants }))

        expect(res.status).toBe(409)
        expect(prisma.organization.updateMany).toHaveBeenCalledTimes(1)
    })
})
