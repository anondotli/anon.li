/**
 * @vitest-environment node
 *
 * - Setting/removing a PGP key or changing the default on a shared org
 *   recipient affects mail for the whole team → admin+ (members get
 *   ForbiddenError).
 * - The forwarding-loop guard only considers VERIFIED custom domains, so an
 *   unverified claim (e.g. someone adding gmail.com) can't block recipients.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    getRecipientById: vi.fn(),
    updateRecipientPgpKey: vi.fn(),
    domainFindFirst: vi.fn(),
    setDefaultRecipient: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        domain: { findFirst: mocks.domainFindFirst },
        $transaction: vi.fn(),
    },
}))
vi.mock("@/lib/data/recipient", () => ({
    getRecipientsWithAliasCount: vi.fn(),
    getVerifiedRecipients: vi.fn(),
    getRecipientById: mocks.getRecipientById,
    getRecipientByIdWithAliasCount: vi.fn(),
    getRecipientByScopeAndEmail: vi.fn(),
    getRecipientByVerificationToken: vi.fn(),
    getDefaultRecipient: vi.fn(),
    updateRecipient: vi.fn(),
    setDefaultRecipient: mocks.setDefaultRecipient,
    deleteRecipientById: vi.fn(),
    verifyRecipient: vi.fn(),
    updateRecipientPgpKey: mocks.updateRecipientPgpKey,
    createDefaultRecipientForUser: vi.fn(),
}))
vi.mock("@/lib/data/user", () => ({ getUserById: vi.fn().mockResolvedValue(null) }))
vi.mock("@/lib/resend", () => ({ sendRecipientVerificationEmail: vi.fn() }))

import { RecipientService } from "@/lib/services/recipient"
import { ForbiddenError, NotFoundError, ValidationError } from "@/lib/api-error-utils"
import { orgScope, personalScope } from "@/lib/ownership"

const orgRecipient = { id: "rec-1", email: "team@example.com", userId: "admin-1", organizationId: "org-1" }

describe("RecipientService PGP key management RBAC", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getRecipientById.mockResolvedValue(orgRecipient)
    })

    it("forbids a member from setting a shared org recipient's PGP key", async () => {
        await expect(
            RecipientService.setPgpKey(orgScope("member-1", "org-1", "member"), "rec-1", "-----BEGIN PGP PUBLIC KEY BLOCK-----"),
        ).rejects.toBeInstanceOf(ForbiddenError)
        expect(mocks.updateRecipientPgpKey).not.toHaveBeenCalled()
    })

    it("forbids a member from removing a shared org recipient's PGP key", async () => {
        await expect(
            RecipientService.removePgpKey(orgScope("member-1", "org-1", "member"), "rec-1"),
        ).rejects.toBeInstanceOf(ForbiddenError)
        expect(mocks.updateRecipientPgpKey).not.toHaveBeenCalled()
    })

    it("allows an org admin to remove it", async () => {
        await expect(
            RecipientService.removePgpKey(orgScope("admin-2", "org-1", "admin"), "rec-1"),
        ).resolves.toEqual({ success: true })
    })

    it("allows a personal owner to remove their own key", async () => {
        mocks.getRecipientById.mockResolvedValue({ ...orgRecipient, userId: "user-1", organizationId: null })

        await expect(RecipientService.removePgpKey(personalScope("user-1"), "rec-1")).resolves.toEqual({ success: true })
    })
})

describe("RecipientService.setAsDefault RBAC", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.getRecipientById.mockResolvedValue({ ...orgRecipient, verified: true })
    })

    it("forbids a member from changing the team's default recipient", async () => {
        await expect(
            RecipientService.setAsDefault(orgScope("member-1", "org-1", "member"), "rec-1"),
        ).rejects.toBeInstanceOf(ForbiddenError)
        expect(mocks.setDefaultRecipient).not.toHaveBeenCalled()
    })

    it("allows an org admin", async () => {
        await RecipientService.setAsDefault(orgScope("admin-2", "org-1", "admin"), "rec-1")
        expect(mocks.setDefaultRecipient).toHaveBeenCalledWith(orgScope("admin-2", "org-1", "admin"), "rec-1")
    })

    it("allows a personal owner", async () => {
        mocks.getRecipientById.mockResolvedValue({ ...orgRecipient, verified: true, userId: "user-1", organizationId: null })
        await RecipientService.setAsDefault(personalScope("user-1"), "rec-1")
        expect(mocks.setDefaultRecipient).toHaveBeenCalled()
    })
})

describe("RecipientService.addRecipient forwarding-loop guard", () => {
    beforeEach(() => vi.clearAllMocks())

    it("only matches verified custom domains", async () => {
        mocks.domainFindFirst.mockResolvedValue(null)

        // getUserById → null makes the call stop right after the domain guard.
        await expect(RecipientService.addRecipient(personalScope("user-1"), "someone@gmail.com"))
            .rejects.toBeInstanceOf(NotFoundError)
        expect(mocks.domainFindFirst).toHaveBeenCalledWith({ where: { domain: "gmail.com", verified: true } })
    })

    it("rejects an address on a verified alias domain", async () => {
        mocks.domainFindFirst.mockResolvedValue({ id: "d1" })

        await expect(RecipientService.addRecipient(personalScope("user-1"), "x@acme.com"))
            .rejects.toBeInstanceOf(ValidationError)
    })
})
