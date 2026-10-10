/**
 * @vitest-environment node
 *
 * AliasService invariants:
 * - limit pre-checks use the OWNING plan (the org's in org scope), not the
 *   acting member's personal plan, with a pooled DB count;
 * - reserved local parts (hard-coded + admin ReservedAlias table) apply only on
 *   the shared anon.li domain, not on users' own verified domains;
 * - re-routing / pausing a shared org alias is admin+, label edits are not;
 * - `active` is an idempotent set; duplicate recipient ids are deduped.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => {
    const tx = {
        $queryRaw: vi.fn(),
        alias: { findUnique: vi.fn(), count: vi.fn(), create: vi.fn(), update: vi.fn() },
        aliasRecipient: { createMany: vi.fn(), deleteMany: vi.fn(), create: vi.fn() },
    }
    return {
        tx,
        aliasCount: vi.fn(),
        aliasFindUnique: vi.fn(),
        aliasUpdate: vi.fn(),
        reservedFindMany: vi.fn(),
        recipientFindMany: vi.fn(),
        transaction: vi.fn(),
        getAliasById: vi.fn(),
        getUserById: vi.fn(),
        getOrgLimitContext: vi.fn(),
        getDomains: vi.fn(),
        getDefaultRecipient: vi.fn(),
    }
})

vi.mock("@/lib/prisma", () => ({
    prisma: {
        alias: { count: mocks.aliasCount, findUnique: mocks.aliasFindUnique, update: mocks.aliasUpdate },
        reservedAlias: { findMany: mocks.reservedFindMany },
        recipient: { findMany: mocks.recipientFindMany },
        $transaction: mocks.transaction,
    },
}))
vi.mock("@/lib/data/alias", () => ({
    getAliasById: mocks.getAliasById,
    getAliases: vi.fn(),
    countAliases: vi.fn(),
    deleteAliasById: vi.fn(),
}))
vi.mock("@/lib/data/user", () => ({ getUserById: mocks.getUserById }))
vi.mock("@/lib/data/auth", () => ({ getOrgLimitContext: mocks.getOrgLimitContext }))
vi.mock("@/lib/data/domain", () => ({ getDomains: mocks.getDomains }))
vi.mock("@/lib/data/recipient", () => ({
    getRecipientById: vi.fn(),
    getDefaultRecipient: mocks.getDefaultRecipient,
    getRecipientByScopeAndEmail: vi.fn(),
}))
// Limits are carried on the context object so tests can tell which plan was used.
vi.mock("@/lib/limits", () => ({
    getPlanLimits: (ctx: { limits: unknown }) => ctx.limits,
    getEffectiveTier: () => "free",
    assertOrgPlanActive: vi.fn(),
}))

import { AliasService, clearReservedAliasCache } from "@/lib/services/alias"
import { ForbiddenError, UpgradeRequiredError, ValidationError } from "@/lib/api-error-utils"
import { orgScope, personalScope } from "@/lib/ownership"

const freeUser = {
    id: "user-1",
    email: "user@example.com",
    banned: false,
    banAliasCreation: false,
    limits: { random: 0, custom: 0, recipientsPerAlias: 1 },
}
const orgContext = { limits: { random: 100, custom: 100, recipientsPerAlias: 5 } }
const defaultRecipient = { id: "rec-1", email: "user@example.com", verified: true }

describe("AliasService.createAlias", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        clearReservedAliasCache()
        mocks.getUserById.mockResolvedValue(freeUser)
        mocks.getOrgLimitContext.mockResolvedValue(orgContext)
        mocks.getDefaultRecipient.mockResolvedValue(defaultRecipient)
        mocks.aliasCount.mockResolvedValue(3)
        mocks.aliasFindUnique.mockResolvedValue(null)
        mocks.reservedFindMany.mockResolvedValue([])
        mocks.getDomains.mockResolvedValue([{ domain: "acme.com", verified: true }])
        mocks.tx.alias.findUnique.mockResolvedValue(null)
        mocks.tx.alias.count.mockResolvedValue(3)
        mocks.tx.alias.create.mockImplementation(async ({ data }) => ({ id: "alias-1", ...data }))
        mocks.transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
    })

    it("uses the org plan (not the member's free plan) for the pre-check, counted in the DB", async () => {
        const scope = orgScope("user-1", "org-1", "member")

        await expect(AliasService.createAlias(scope, { domain: "anon.li", format: "RANDOM" }))
            .resolves.toMatchObject({ id: "alias-1" })

        expect(mocks.aliasCount).toHaveBeenCalledWith({ where: { organizationId: "org-1", format: "RANDOM" } })
    })

    it("still enforces the personal plan in personal scope", async () => {
        await expect(
            AliasService.createAlias(personalScope("user-1"), { domain: "anon.li", format: "RANDOM" }),
        ).rejects.toBeInstanceOf(UpgradeRequiredError)
    })

    it("blocks hard-coded reserved local parts on the shared anon.li domain", async () => {
        const scope = orgScope("user-1", "org-1", "admin")

        await expect(
            AliasService.createAlias(scope, { domain: "anon.li", format: "CUSTOM", localPart: "admin" }),
        ).rejects.toBeInstanceOf(ValidationError)
    })

    it("blocks admin-managed ReservedAlias entries on anon.li", async () => {
        mocks.reservedFindMany.mockResolvedValue([{ alias: "acmecorp" }])
        const scope = orgScope("user-1", "org-1", "admin")

        await expect(
            AliasService.createAlias(scope, { domain: "anon.li", format: "CUSTOM", localPart: "acmecorp" }),
        ).rejects.toMatchObject({ message: expect.stringContaining("reserved") })
    })

    it("allows role addresses on the user's own verified domain", async () => {
        mocks.reservedFindMany.mockResolvedValue([{ alias: "acmecorp" }])
        const scope = orgScope("user-1", "org-1", "admin")

        await expect(
            AliasService.createAlias(scope, { domain: "acme.com", format: "CUSTOM", localPart: "admin" }),
        ).resolves.toMatchObject({ email: "admin@acme.com" })
        await expect(
            AliasService.createAlias(scope, { domain: "acme.com", format: "CUSTOM", localPart: "acmecorp" }),
        ).resolves.toMatchObject({ email: "acmecorp@acme.com" })
    })

    it("dedupes repeated recipient ids instead of failing the join-row insert", async () => {
        mocks.recipientFindMany.mockResolvedValue([{ id: "rec-a", email: "a@example.com", verified: true }])
        const scope = orgScope("user-1", "org-1", "admin")

        await AliasService.createAlias(scope, { domain: "anon.li", format: "RANDOM", recipientIds: ["rec-a", "rec-a"] })

        expect(mocks.tx.aliasRecipient.createMany).toHaveBeenCalledWith({
            data: [{ aliasId: "alias-1", recipientId: "rec-a", ordinal: 0, isPrimary: true }],
        })
    })
})

describe("AliasService.updateAlias", () => {
    const orgAlias = { id: "alias-1", userId: "admin-1", organizationId: "org-1", active: true }
    const member = orgScope("member-1", "org-1", "member")
    const admin = orgScope("admin-1", "org-1", "admin")

    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getAliasById.mockResolvedValue(orgAlias)
        mocks.getOrgLimitContext.mockResolvedValue(orgContext)
        mocks.aliasUpdate.mockResolvedValue(orgAlias)
        mocks.recipientFindMany.mockResolvedValue([{ id: "rec-b", email: "b@example.com", verified: true }])
        mocks.tx.alias.update.mockResolvedValue(orgAlias)
        mocks.tx.$queryRaw.mockResolvedValue([{ orgKeyGeneration: 3 }])
        mocks.transaction.mockImplementation(async (fn: (tx: typeof mocks.tx) => unknown) => fn(mocks.tx))
    })

    it("forbids a member from repointing a shared org alias", async () => {
        await expect(AliasService.updateAlias(member, "alias-1", { recipientIds: ["rec-b"] }))
            .rejects.toBeInstanceOf(ForbiddenError)
        await expect(AliasService.updateAlias(member, "alias-1", { recipientId: "rec-b" }))
            .rejects.toBeInstanceOf(ForbiddenError)
        await expect(AliasService.updateAlias(member, "alias-1", { recipientEmail: "b@example.com" }))
            .rejects.toBeInstanceOf(ForbiddenError)
        expect(mocks.transaction).not.toHaveBeenCalled()
    })

    it("forbids a member from pausing a shared org alias", async () => {
        await expect(AliasService.updateAlias(member, "alias-1", { active: false }))
            .rejects.toBeInstanceOf(ForbiddenError)
        expect(mocks.aliasUpdate).not.toHaveBeenCalled()
    })

    it("still lets a member edit encrypted label/note metadata (with the current team key generation)", async () => {
        await AliasService.updateAlias(member, "alias-1", { encryptedLabel: "ct", clearLegacyLabel: true, orgKeyGeneration: 3 })

        expect(mocks.tx.alias.update).toHaveBeenCalledWith({
            where: { id: "alias-1" },
            data: { encryptedLabel: "ct", legacyLabel: null },
        })
    })

    it("locks the org row and rejects org ciphertext made with a stale team key generation", async () => {
        await expect(
            AliasService.updateAlias(member, "alias-1", { encryptedLabel: "ct", orgKeyGeneration: 2 }),
        ).rejects.toMatchObject({ statusCode: 409, code: "ORG_KEY_GENERATION_MISMATCH", message: "Team encryption key changed — please retry" })
        const sql = (mocks.tx.$queryRaw.mock.calls[0]![0] as TemplateStringsArray).join("?")
        expect(sql).toContain("FOR UPDATE")
        expect(mocks.tx.alias.update).not.toHaveBeenCalled()
    })

    it("rejects org ciphertext without a team key generation", async () => {
        await expect(
            AliasService.updateAlias(member, "alias-1", { encryptedNote: "ct" }),
        ).rejects.toMatchObject({ code: "ORG_KEY_GENERATION_MISMATCH" })
    })

    it("does not require a generation to clear org metadata", async () => {
        await AliasService.updateAlias(member, "alias-1", { encryptedLabel: null, clearLegacyLabel: true })

        expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
        expect(mocks.aliasUpdate).toHaveBeenCalledWith({
            where: { id: "alias-1" },
            data: { encryptedLabel: null, legacyLabel: null },
        })
    })

    it("does not check generations for personal aliases", async () => {
        mocks.getAliasById.mockResolvedValue({ ...orgAlias, userId: "user-1", organizationId: null })

        await AliasService.updateAlias(personalScope("user-1"), "alias-1", { encryptedLabel: "ct" })

        expect(mocks.tx.$queryRaw).not.toHaveBeenCalled()
        expect(mocks.aliasUpdate).toHaveBeenCalled()
    })

    it("sets active to the requested value (no read-then-toggle)", async () => {
        await AliasService.updateAlias(admin, "alias-1", { active: false })

        expect(mocks.aliasUpdate).toHaveBeenCalledWith({
            where: { id: "alias-1" },
            data: { active: false },
        })
    })

    it("treats an unchanged active value as a no-op, so members can resend it with label edits", async () => {
        // orgAlias.active is already true: a full-object PATCH must not 403.
        await AliasService.updateAlias(member, "alias-1", { active: true, encryptedLabel: "ct", orgKeyGeneration: 3 })

        expect(mocks.tx.alias.update).toHaveBeenCalledWith({
            where: { id: "alias-1" },
            data: { encryptedLabel: "ct" },
        })
    })

    it("applies active atomically with a recipient change, after recipient validation", async () => {
        await AliasService.updateAlias(admin, "alias-1", { recipientIds: ["rec-b"], active: false })

        expect(mocks.tx.alias.update).toHaveBeenCalledWith({
            where: { id: "alias-1" },
            data: expect.objectContaining({ recipientId: "rec-b", active: false }),
        })
        expect(mocks.aliasUpdate).not.toHaveBeenCalled()
    })

    it("does not change active when recipient validation fails", async () => {
        mocks.recipientFindMany.mockResolvedValue([])

        await expect(AliasService.updateAlias(admin, "alias-1", { recipientIds: ["missing"], active: false }))
            .rejects.toMatchObject({ name: "NotFoundError" })
        expect(mocks.aliasUpdate).not.toHaveBeenCalled()
        expect(mocks.tx.alias.update).not.toHaveBeenCalled()
    })

    it("dedupes repeated recipient ids", async () => {
        await AliasService.updateAlias(admin, "alias-1", { recipientIds: ["rec-b", "rec-b"] })

        expect(mocks.tx.aliasRecipient.createMany).toHaveBeenCalledWith({
            data: [{ aliasId: "alias-1", recipientId: "rec-b", ordinal: 0, isPrimary: true }],
        })
    })
})

describe("AliasService takedown lock", () => {
    const owner = personalScope("user-1")
    const takenDown = { id: "alias-1", userId: "user-1", organizationId: null, active: false, takenDownAt: new Date() }

    beforeEach(() => {
        vi.clearAllMocks()
        mocks.aliasUpdate.mockResolvedValue({ ...takenDown, active: true })
    })

    it("refuses to toggle a taken-down alias back on", async () => {
        mocks.getAliasById.mockResolvedValue(takenDown)

        await expect(AliasService.toggleAlias(owner, "alias-1")).rejects.toMatchObject({
            name: "ForbiddenError",
            message: expect.stringContaining("disabled by anon.li"),
        })
        expect(mocks.aliasUpdate).not.toHaveBeenCalled()
    })

    it("re-enables with a conditional write so a concurrent takedown wins", async () => {
        mocks.getAliasById.mockResolvedValue({ ...takenDown, takenDownAt: null })

        await AliasService.toggleAlias(owner, "alias-1")

        expect(mocks.aliasUpdate).toHaveBeenCalledWith({
            where: { id: "alias-1", takenDownAt: null },
            data: { active: true },
        })
    })

    it("maps a lost race (P2025 on the conditional write) to ForbiddenError", async () => {
        const { Prisma } = await import("@prisma/client")
        mocks.getAliasById.mockResolvedValue({ ...takenDown, takenDownAt: null })
        mocks.aliasUpdate.mockRejectedValue(
            new Prisma.PrismaClientKnownRequestError("Record not found", { code: "P2025", clientVersion: "test" }),
        )

        await expect(AliasService.toggleAlias(owner, "alias-1")).rejects.toBeInstanceOf(ForbiddenError)
    })

    it("still allows pausing (toggle off) without the takedown condition", async () => {
        mocks.getAliasById.mockResolvedValue({ ...takenDown, active: true, takenDownAt: null })

        await AliasService.toggleAlias(owner, "alias-1")

        expect(mocks.aliasUpdate).toHaveBeenCalledWith({ where: { id: "alias-1" }, data: { active: false } })
    })

    it("refuses updateAlias active:true on a taken-down alias", async () => {
        mocks.getAliasById.mockResolvedValue(takenDown)

        await expect(AliasService.updateAlias(owner, "alias-1", { active: true })).rejects.toBeInstanceOf(ForbiddenError)
        expect(mocks.aliasUpdate).not.toHaveBeenCalled()
    })

    it("guards updateAlias re-enable with takenDownAt: null in the write", async () => {
        mocks.getAliasById.mockResolvedValue({ ...takenDown, takenDownAt: null })

        await AliasService.updateAlias(owner, "alias-1", { active: true })

        expect(mocks.aliasUpdate).toHaveBeenCalledWith({
            where: { id: "alias-1", takenDownAt: null },
            data: { active: true },
        })
    })
})
