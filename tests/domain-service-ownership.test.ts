/**
 * @vitest-environment node
 *
 * Custom-domain ownership invariants:
 * - an unverified claim by someone else must not block the real owner
 *   (domain squatting); a VERIFIED row, or the same owner's own row, does;
 * - verifyDomain revokes other owners BEFORE marking this row verified (the
 *   partial unique index allows one verified row per name), deactivates the
 *   superseded owners' aliases in the same transaction, and maps a
 *   concurrent-verify P2002 to a ConflictError;
 * - losing verification stamps `unverifiedAt` (cleanup grace period);
 * - DKIM rotation on a shared org domain is admin+.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"

const mocks = vi.hoisted(() => {
    const tx = {
        domain: { count: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    }
    return {
        tx,
        domainFindFirst: vi.fn(),
        domainFindUnique: vi.fn(),
        domainCount: vi.fn(),
        domainUpdate: vi.fn(),
        domainUpdateMany: vi.fn(),
        transaction: vi.fn(),
        resolveMx: vi.fn(),
        resolveTxt: vi.fn(),
    }
})

vi.mock("dns", () => ({
    default: { resolveMx: mocks.resolveMx, resolveTxt: mocks.resolveTxt },
    resolveMx: mocks.resolveMx,
    resolveTxt: mocks.resolveTxt,
}))
vi.mock("@/lib/prisma", () => ({
    prisma: {
        domain: {
            findFirst: mocks.domainFindFirst,
            findUnique: mocks.domainFindUnique,
            count: mocks.domainCount,
            update: mocks.domainUpdate,
            updateMany: mocks.domainUpdateMany,
        },
        $transaction: mocks.transaction,
    },
}))
vi.mock("@/lib/data/user", () => ({ getUserById: vi.fn(async () => ({ id: "user-1", subscriptions: [] })) }))
vi.mock("@/lib/data/auth", () => ({ getOrgLimitContext: vi.fn(async () => ({ subscriptions: [] })) }))
vi.mock("@/lib/limits", () => ({
    getPlanLimits: vi.fn(() => ({ domains: 5 })),
    assertOrgPlanActive: vi.fn(),
}))
vi.mock("@/lib/dkim", () => ({ generateDkimKeys: vi.fn(async () => ({ privateKey: "priv", publicKey: "pub" })) }))
vi.mock("@/lib/field-encryption", () => ({ encryptField: vi.fn(() => "enc:priv") }))
vi.mock("@/lib/services/audit", () => ({ audit: vi.fn() }))
vi.mock("@/lib/posthog.server", () => ({ trackServerEvent: vi.fn() }))

import { DomainService } from "@/lib/services/domain"
import { ConflictError, ForbiddenError } from "@/lib/api-error-utils"
import { orgScope, personalScope } from "@/lib/ownership"

const scope = personalScope("user-1")

function dnsCallback<T>(value: T) {
    return (_name: string, cb: (err: Error | null, value?: T) => void) => cb(null, value)
}

describe("DomainService.createDomain claim rules", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.domainCount.mockResolvedValue(0)
        mocks.tx.domain.count.mockResolvedValue(0)
        mocks.tx.domain.create.mockImplementation(async ({ data }) => ({ id: "new", ...data }))
        mocks.transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
    })

    it("allows claiming a name another account has only claimed (unverified)", async () => {
        // The claim check only matches verified rows or the caller's own rows,
        // so another account's unverified squat yields no match.
        mocks.domainFindFirst.mockResolvedValue(null)
        mocks.tx.domain.findFirst.mockResolvedValue(null)

        const created = await DomainService.createDomain(scope, "Example.COM")

        expect(created).toMatchObject({ domain: "example.com", userId: "user-1" })
        expect(mocks.domainFindFirst).toHaveBeenCalledWith(expect.objectContaining({
            where: {
                domain: "example.com",
                OR: [{ verified: true }, { userId: "user-1", organizationId: null }],
            },
        }))
    })

    it("rejects a name already verified by another account", async () => {
        mocks.domainFindFirst.mockResolvedValue({ verified: true, userId: "someone-else", organizationId: null })

        await expect(DomainService.createDomain(scope, "example.com")).rejects.toMatchObject({
            name: "ConflictError",
            message: expect.stringContaining("verified by another account"),
        })
        expect(mocks.transaction).not.toHaveBeenCalled()
    })

    it("rejects a name the same owner already added", async () => {
        mocks.domainFindFirst.mockResolvedValue({ verified: false, userId: "user-1", organizationId: null })

        await expect(DomainService.createDomain(scope, "example.com")).rejects.toBeInstanceOf(ConflictError)
    })

    it("re-checks the claim inside the transaction", async () => {
        mocks.domainFindFirst.mockResolvedValue(null)
        mocks.tx.domain.findFirst.mockResolvedValue({ verified: true, userId: "racer", organizationId: null })

        await expect(DomainService.createDomain(scope, "example.com")).rejects.toBeInstanceOf(ConflictError)
        expect(mocks.tx.domain.create).not.toHaveBeenCalled()
    })

    it("rejects anon.li subdomains as reserved", async () => {
        await expect(DomainService.createDomain(scope, "mail.anon.li")).rejects.toMatchObject({
            message: expect.stringContaining("reserved"),
        })
    })
})

describe("DomainService.verifyDomain", () => {
    const baseDomain = {
        id: "d1",
        domain: "example.com",
        userId: "user-1",
        organizationId: null,
        verified: false,
        unverifiedAt: null,
        verificationToken: "tok",
        dkimPublicKey: null,
        dkimSelector: null,
    }

    // Interactive transaction: record every call in order on one log.
    const calls: { op: string; args: { where: Record<string, unknown>; data: Record<string, unknown> } }[] = []
    const vtx = {
        domain: {
            findMany: vi.fn(),
            updateMany: vi.fn(async (args) => { calls.push({ op: "domain.updateMany", args }) }),
            update: vi.fn(async (args) => { calls.push({ op: "domain.update", args }) }),
        },
        alias: {
            updateMany: vi.fn(async (args) => { calls.push({ op: "alias.updateMany", args }) }),
        },
    }

    beforeEach(() => {
        vi.clearAllMocks()
        calls.length = 0
        vtx.domain.findMany.mockResolvedValue([])
        mocks.transaction.mockImplementation(async (fn: (tx: typeof vtx) => unknown) => fn(vtx))
    })

    function mockPassingDns() {
        mocks.resolveMx.mockImplementation(dnsCallback([{ exchange: "mx.anon.li", priority: 10 }]))
        mocks.resolveTxt.mockImplementation(dnsCallback([["anon.li=tok"], ["v=spf1 include:anon.li ~all"]]))
    }

    function mockFailingDns() {
        mocks.resolveMx.mockImplementation(dnsCallback([]))
        mocks.resolveTxt.mockImplementation(dnsCallback([]))
    }

    it("revokes other verified owners and deactivates their aliases before marking this domain verified", async () => {
        mocks.domainFindUnique.mockResolvedValue(baseDomain)
        vtx.domain.findMany.mockResolvedValue([
            { id: "old-personal", userId: "old-user", organizationId: null },
            { id: "old-org", userId: "someone", organizationId: "org-9" },
        ])
        mockPassingDns()

        const result = await DomainService.verifyDomain(scope, "d1")

        expect(result.verified).toBe(true)
        expect(calls.map((c) => c.op)).toEqual([
            "domain.updateMany", "alias.updateMany", "alias.updateMany", "domain.update",
        ])
        expect(calls[0]!.args).toMatchObject({
            where: { id: { in: ["old-personal", "old-org"] }, verified: true },
            data: { verified: false, unverifiedAt: expect.any(Date) },
        })
        // Reversible deactivation scoped to each previous owner — never a delete,
        // and never touching the new owner's aliases.
        expect(calls[1]!.args).toEqual({
            where: { domain: "example.com", userId: "old-user", organizationId: null },
            data: { active: false },
        })
        expect(calls[2]!.args).toEqual({
            where: { domain: "example.com", organizationId: "org-9" },
            data: { active: false },
        })
        expect(calls[3]!.args.data).toMatchObject({ verified: true, unverifiedAt: null })
    })

    it("does not touch any aliases when nothing is superseded (re-verify leaves inactive aliases inactive)", async () => {
        mocks.domainFindUnique.mockResolvedValue({ ...baseDomain, unverifiedAt: new Date() })
        mockPassingDns()

        await DomainService.verifyDomain(scope, "d1")

        expect(vtx.alias.updateMany).not.toHaveBeenCalled()
        expect(calls.map((c) => c.op)).toEqual(["domain.update"])
        expect(calls[0]!.args.data).toMatchObject({ verified: true, unverifiedAt: null })
    })

    it("maps a concurrent verify (P2002 on the partial unique index) to ConflictError", async () => {
        mocks.domainFindUnique.mockResolvedValue(baseDomain)
        mockPassingDns()
        mocks.transaction.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" }),
        )

        await expect(DomainService.verifyDomain(scope, "d1")).rejects.toBeInstanceOf(ConflictError)
    })

    it("stamps unverifiedAt when a previously verified domain fails a re-check", async () => {
        mocks.domainFindUnique.mockResolvedValue({ ...baseDomain, verified: true })
        mockFailingDns()

        await DomainService.verifyDomain(scope, "d1")

        expect(vtx.domain.findMany).not.toHaveBeenCalled()
        expect(calls.map((c) => c.op)).toEqual(["domain.update"])
        expect(calls[0]!.args.data).toMatchObject({ verified: false, unverifiedAt: expect.any(Date) })
    })

    it("leaves unverifiedAt null for a never-verified domain that still fails", async () => {
        mocks.domainFindUnique.mockResolvedValue(baseDomain)
        mockFailingDns()

        await DomainService.verifyDomain(scope, "d1")

        expect(calls[0]!.args.data).toMatchObject({ verified: false, unverifiedAt: null })
    })
})

describe("DomainService.regenerateDkim", () => {
    beforeEach(() => vi.clearAllMocks())

    it("forbids a plain org member from rotating a shared domain's DKIM key", async () => {
        mocks.domainFindUnique.mockResolvedValue({ id: "d1", domain: "example.com", userId: "admin-1", organizationId: "org-1" })

        await expect(
            DomainService.regenerateDkim(orgScope("member-1", "org-1", "member"), "d1"),
        ).rejects.toBeInstanceOf(ForbiddenError)
        expect(mocks.domainUpdate).not.toHaveBeenCalled()
    })

    it("allows an org admin", async () => {
        mocks.domainFindUnique.mockResolvedValue({ id: "d1", domain: "example.com", userId: "admin-1", organizationId: "org-1" })
        mocks.domainUpdate.mockResolvedValue({ id: "d1", domain: "example.com", dkimPublicKey: "pub", dkimSelector: "default", dkimVerified: false })

        await expect(
            DomainService.regenerateDkim(orgScope("admin-2", "org-1", "admin"), "d1"),
        ).resolves.toMatchObject({ id: "d1" })
    })
})
