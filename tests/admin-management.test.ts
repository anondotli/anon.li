import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { AdminService } from "@/lib/services/admin"
import { prisma } from "@/lib/prisma"
import { ConflictError, ForbiddenError, ServiceUnavailableError, ValidationError } from "@/lib/api-error-utils"
import { deleteDropFilesAndReleaseQuota } from "@/lib/services/drop-storage"

const stripeMocks = vi.hoisted(() => ({ cancel: vi.fn(), retrieve: vi.fn() }))
vi.mock("@/lib/stripe", () => ({
    stripe: { subscriptions: { cancel: stripeMocks.cancel, retrieve: stripeMocks.retrieve } },
}))

vi.mock("resend", () => ({
    Resend: class {
        emails = { send: vi.fn() }
    },
}))

vi.mock("@/lib/prisma", () => {
    const mock = {
        organization: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
        drop: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
        orphanedFile: { createMany: vi.fn() },
        member: { findUnique: vi.fn(), count: vi.fn(), delete: vi.fn(), update: vi.fn() },
        organizationMemberKey: { deleteMany: vi.fn() },
        apiKey: { deleteMany: vi.fn() },
        invitation: { findUnique: vi.fn(), update: vi.fn() },
        user: { findUnique: vi.fn(), update: vi.fn() },
        twoFactor: { deleteMany: vi.fn() },
        oauthClient: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
        oauthRefreshToken: { updateMany: vi.fn() },
        oauthAccessToken: { deleteMany: vi.fn() },
        oauthConsent: { deleteMany: vi.fn() },
        form: { findUnique: vi.fn(), delete: vi.fn() },
        subscription: { findMany: vi.fn(), update: vi.fn() },
        recipient: { findUnique: vi.fn(), delete: vi.fn() },
        alias: { count: vi.fn() },
        domain: { findUnique: vi.fn(), findFirst: vi.fn(), update: vi.fn(), updateMany: vi.fn() },
        $queryRaw: vi.fn(),
        $transaction: vi.fn((arg: unknown) =>
            Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
        ),
    }
    return { prisma: mock }
})

vi.mock("@/lib/services/drop-storage", () => ({
    deleteDropFilesAndReleaseQuota: vi.fn().mockResolvedValue({
        files: [],
        deletedFiles: 0,
        releasedBytes: BigInt(0),
    }),
}))

vi.mock("@/lib/storage", () => ({ abortMultipartUpload: vi.fn() }))

type MethodName = "findUnique" | "findFirst" | "update" | "delete" | "deleteMany" | "createMany" | "findMany" | "count" | "updateMany"
type Model = Record<MethodName, Mock>
const db = prisma as unknown as {
    organization: Model
    drop: Model
    orphanedFile: Model
    member: Model
    organizationMemberKey: Model
    apiKey: Model
    invitation: Model
    user: Model
    twoFactor: Model
    oauthClient: Model
    oauthRefreshToken: Model
    oauthAccessToken: Model
    oauthConsent: Model
    form: Model
    subscription: Model
    recipient: Model
    alias: Model
    domain: Model
    $queryRaw: Mock
    $transaction: Mock
}

beforeEach(() => {
    vi.clearAllMocks()
    db.subscription.findMany.mockResolvedValue([])
})

describe("AdminService — organization management", () => {
    it("suspends an organization with a reason", async () => {
        db.organization.findUnique.mockResolvedValue({ id: "org_1" })
        await AdminService.suspendOrganization("org_1", "Fraudulent activity")

        expect(db.organization.update).toHaveBeenCalledWith({
            where: { id: "org_1" },
            data: expect.objectContaining({ suspendedReason: "Fraudulent activity", suspendedAt: expect.any(Date) }),
        })
    })

    it("clears suspension on unsuspend", async () => {
        db.organization.findUnique.mockResolvedValue({ id: "org_1" })
        await AdminService.unsuspendOrganization("org_1")

        expect(db.organization.update).toHaveBeenCalledWith({
            where: { id: "org_1" },
            data: { suspendedAt: null, suspendedReason: null },
        })
    })

    it("enqueues orphaned-file cleanup for org-owned drops before deleting the org", async () => {
        db.organization.findUnique.mockResolvedValue({ id: "org_1" })
        db.drop.findMany.mockResolvedValue([
            { id: "drop_1" },
            { id: "drop_2" },
        ])
        ;(deleteDropFilesAndReleaseQuota as Mock)
            .mockResolvedValueOnce({
                files: [
                    { storageKey: "k1", s3UploadId: null, size: BigInt(1) },
                    { storageKey: "k2", s3UploadId: null, size: BigInt(1) },
                ],
                deletedFiles: 2,
                releasedBytes: BigInt(2),
            })
            .mockResolvedValueOnce({
                files: [{ storageKey: "k3", s3UploadId: null, size: BigInt(1) }],
                deletedFiles: 1,
                releasedBytes: BigInt(1),
            })

        const result = await AdminService.deleteOrganization("org_1")

        expect(db.orphanedFile.createMany).toHaveBeenCalledWith({
            data: [{ storageKey: "k1" }, { storageKey: "k2" }, { storageKey: "k3" }],
        })
        expect(db.organization.delete).toHaveBeenCalledWith({ where: { id: "org_1" } })
        expect(deleteDropFilesAndReleaseQuota).toHaveBeenCalledTimes(2)
        expect(deleteDropFilesAndReleaseQuota).toHaveBeenNthCalledWith(1, "drop_1")
        expect(deleteDropFilesAndReleaseQuota).toHaveBeenNthCalledWith(2, "drop_2")
        expect(result).toEqual({ success: true, orphanedFiles: 3 })
    })

    it("cancels the org's Stripe subscriptions before deleting anything", async () => {
        db.organization.findUnique.mockResolvedValue({ id: "org_1" })
        db.drop.findMany.mockResolvedValue([])
        db.subscription.findMany.mockResolvedValue([{ id: "sub_local", providerSubscriptionId: "sub_stripe" }])
        stripeMocks.cancel.mockResolvedValue({ status: "canceled" })

        await AdminService.deleteOrganization("org_1")

        expect(db.subscription.findMany).toHaveBeenCalledWith(expect.objectContaining({
            where: expect.objectContaining({
                organizationId: "org_1",
                provider: "stripe",
                status: { in: expect.arrayContaining(["active", "trialing", "past_due"]) },
            }),
        }))
        expect(stripeMocks.cancel).toHaveBeenCalledWith("sub_stripe")
        expect(db.subscription.update).toHaveBeenCalledWith({
            where: { id: "sub_local" },
            data: { status: "canceled", cancelAtPeriodEnd: false },
        })
        expect(stripeMocks.cancel.mock.invocationCallOrder[0]).toBeLessThan(
            db.organization.delete.mock.invocationCallOrder[0]!,
        )
    })

    it("does not delete the org when the Stripe cancellation can't be confirmed", async () => {
        db.organization.findUnique.mockResolvedValue({ id: "org_1" })
        db.subscription.findMany.mockResolvedValue([{ id: "sub_local", providerSubscriptionId: "sub_stripe" }])
        stripeMocks.cancel.mockRejectedValue(new Error("Stripe is down"))
        stripeMocks.retrieve.mockRejectedValue(new Error("Stripe is down"))

        await expect(AdminService.deleteOrganization("org_1")).rejects.toBeInstanceOf(ServiceUnavailableError)
        expect(deleteDropFilesAndReleaseQuota).not.toHaveBeenCalled()
        expect(db.organization.delete).not.toHaveBeenCalled()
    })

    it("refuses to remove the only owner of an organization", async () => {
        db.member.findUnique.mockResolvedValue({ id: "m_1", role: "owner" })
        db.member.count.mockResolvedValue(1)

        await expect(AdminService.removeOrgMember("org_1", "user_1")).rejects.toBeInstanceOf(ValidationError)
        expect(db.member.delete).not.toHaveBeenCalled()
    })

    it("removes a member, drops their wrapped key and org API keys, and flags key rotation", async () => {
        db.member.findUnique.mockResolvedValue({ id: "m_1", role: "member" })

        await AdminService.removeOrgMember("org_1", "user_1")

        expect(db.member.delete).toHaveBeenCalled()
        expect(db.organizationMemberKey.deleteMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", userId: "user_1" },
        })
        // Org API keys they minted must stop working with their membership.
        expect(db.apiKey.deleteMany).toHaveBeenCalledWith({
            where: { organizationId: "org_1", userId: "user_1" },
        })
        expect(db.organization.update).toHaveBeenCalledWith({
            where: { id: "org_1" },
            data: { keyRotationRecommendedAt: expect.any(Date) },
        })
    })

    it("refuses to demote the only owner", async () => {
        db.member.findUnique.mockResolvedValue({ id: "m_1", role: "owner" })
        db.member.count.mockResolvedValue(1)

        await expect(AdminService.updateOrgMemberRole("org_1", "user_1", "admin")).rejects.toBeInstanceOf(ValidationError)
        expect(db.member.update).not.toHaveBeenCalled()
    })
})

describe("AdminService — user editing", () => {
    it("sets the admin flag", async () => {
        db.user.findUnique.mockResolvedValue({ id: "user_1" })
        await AdminService.setUserAdmin("user_1", true)
        expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { isAdmin: true } })
    })

    it("resets 2FA by deleting the secret and clearing the flag", async () => {
        db.user.findUnique.mockResolvedValue({ id: "user_1" })
        await AdminService.resetUser2FA("user_1")

        expect(db.twoFactor.deleteMany).toHaveBeenCalledWith({ where: { userId: "user_1" } })
        expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { twoFactorEnabled: false } })
    })

    it("rejects a negative storage limit", async () => {
        await expect(AdminService.setUserStorageLimit("user_1", BigInt(-1))).rejects.toBeInstanceOf(ValidationError)
    })

    it("sets ToS strikes to an explicit value without banning below 3", async () => {
        db.user.findUnique.mockResolvedValue({ id: "user_1" })
        db.$queryRaw.mockResolvedValue([{ banned: false }])
        const result = await AdminService.setUserStrikes("user_1", 2)
        // Tagged template: [strings, value, autoBan, autoBan, userId]
        const call = db.$queryRaw.mock.calls[0]!
        expect(call).toContain(2)
        expect(call).toContain(false)
        expect(call).not.toContain(true)
        expect(call).toContain("user_1")
        expect(result).toEqual({ success: true, banned: false })
    })

    it("applies the automatic full ban when strikes are set to 3 or more", async () => {
        db.user.findUnique.mockResolvedValue({ id: "user_1" })
        db.$queryRaw.mockResolvedValue([{ banned: true }])
        const result = await AdminService.setUserStrikes("user_1", 3)
        const call = db.$queryRaw.mock.calls[0]!
        expect(call).toContain(3)
        expect(call).toContain(true)
        expect(result).toEqual({ success: true, banned: true })
    })

    it("refuses to ban an admin account", async () => {
        db.user.findUnique.mockResolvedValue({ id: "user_2", isAdmin: true, banned: false, banAliasCreation: false, banFileUpload: false, banReason: null })
        await expect(AdminService.banUser("user_2", { full: true })).rejects.toBeInstanceOf(ForbiddenError)
        expect(db.user.update).not.toHaveBeenCalled()
    })

    it("escalates a partial ban to a full ban, keeping existing flags", async () => {
        db.user.findUnique.mockResolvedValue({ id: "user_2", isAdmin: false, banned: false, banAliasCreation: true, banFileUpload: false, banReason: "spam" })
        await AdminService.banUser("user_2", { full: true, reason: "escalated" })
        expect(db.user.update).toHaveBeenCalledWith({
            where: { id: "user_2" },
            data: { banned: true, banAliasCreation: true, banFileUpload: false, banReason: "escalated" },
        })
    })
})

describe("AdminService — recipients", () => {
    it("refuses to delete a default recipient", async () => {
        db.recipient.findUnique.mockResolvedValue({ id: "rcp_1", email: "a@b.c", isDefault: true })
        await expect(AdminService.deleteRecipient("rcp_1")).rejects.toBeInstanceOf(ValidationError)
        expect(db.recipient.delete).not.toHaveBeenCalled()
    })

    it("refuses to strand aliases that forward only to the recipient", async () => {
        db.recipient.findUnique.mockResolvedValue({ id: "rcp_1", email: "a@b.c", isDefault: false })
        db.alias.count.mockResolvedValue(2)
        await expect(AdminService.deleteRecipient("rcp_1")).rejects.toThrow(/2 alias\(es\) forward only to it/)
        expect(db.alias.count).toHaveBeenCalledWith({
            where: {
                OR: [
                    { recipientId: "rcp_1" },
                    {
                        aliasRecipients: { some: { recipientId: "rcp_1" } },
                        NOT: { aliasRecipients: { some: { recipientId: { not: "rcp_1" } } } },
                    },
                ],
            },
        })
        expect(db.recipient.delete).not.toHaveBeenCalled()
    })

    it("clears catch-all references atomically with the delete", async () => {
        db.recipient.findUnique.mockResolvedValue({ id: "rcp_1", email: "a@b.c", isDefault: false })
        db.alias.count.mockResolvedValue(0)
        db.domain.updateMany.mockResolvedValue({ count: 1 })
        db.recipient.delete.mockResolvedValue({ id: "rcp_1" })

        const result = await AdminService.deleteRecipient("rcp_1")

        expect(db.$transaction).toHaveBeenCalled()
        expect(db.domain.updateMany).toHaveBeenCalledWith({
            where: { catchAllRecipientId: "rcp_1" },
            data: { catchAllRecipientId: null },
        })
        expect(db.recipient.delete).toHaveBeenCalledWith({ where: { id: "rcp_1" } })
        expect(result).toEqual({ success: true, catchAllDomainsCleared: 1 })
    })
})

describe("AdminService — force-verify domain", () => {
    it("refuses when another owner already holds the verified name", async () => {
        db.domain.findUnique.mockResolvedValue({ id: "dom_1", domain: "example.com" })
        db.domain.findFirst.mockResolvedValue({ id: "dom_2", user: { email: "other@example.org" }, organization: null })

        await expect(AdminService.forceVerifyDomain("dom_1")).rejects.toThrow(/already verified by other@example.org \(domain dom_2\)/)
        expect(db.domain.update).not.toHaveBeenCalled()
    })

    it("maps a lost race on the partial unique index to a ConflictError", async () => {
        db.domain.findUnique.mockResolvedValue({ id: "dom_1", domain: "example.com" })
        db.domain.findFirst.mockResolvedValue(null)
        db.domain.update.mockRejectedValue(Object.assign(new Error("Unique constraint"), { code: "P2002" }))

        await expect(AdminService.forceVerifyDomain("dom_1")).rejects.toBeInstanceOf(ConflictError)
    })

    it("verifies and clears the unverified marker when there is no conflict", async () => {
        db.domain.findUnique.mockResolvedValue({ id: "dom_1", domain: "example.com" })
        db.domain.findFirst.mockResolvedValue(null)
        db.domain.update.mockResolvedValue({})

        await AdminService.forceVerifyDomain("dom_1")

        expect(db.domain.update).toHaveBeenCalledWith({
            where: { id: "dom_1" },
            data: expect.objectContaining({ verified: true, unverifiedAt: null }),
        })
    })
})

describe("AdminService — OAuth applications", () => {
    it("deletes the client; tokens, consents and resource links cascade by clientId", async () => {
        db.oauthClient.findUnique.mockResolvedValue({ id: "app_1", clientDiscoveryId: null })

        await AdminService.deleteOauthApp("app_1")

        expect(db.oauthClient.delete).toHaveBeenCalledWith({ where: { id: "app_1" } })
    })

    it("refuses to delete a CIMD client, which would re-register on its next authorize", async () => {
        db.oauthClient.findUnique.mockResolvedValue({ id: "app_1", clientDiscoveryId: "cimd" })
        await expect(AdminService.deleteOauthApp("app_1")).rejects.toThrow(/disable this application instead/)
        expect(db.oauthClient.delete).not.toHaveBeenCalled()
    })

    it("refuses to delete an unknown client", async () => {
        db.oauthClient.findUnique.mockResolvedValue(null)
        await expect(AdminService.deleteOauthApp("missing")).rejects.toThrow("Application not found")
        expect(db.oauthClient.delete).not.toHaveBeenCalled()
    })

    it("disabling an app revokes its refresh tokens, stored access tokens and consents", async () => {
        db.oauthClient.findUnique.mockResolvedValue({ id: "app_1", clientId: "client_abc" })
        await AdminService.setOauthAppDisabled("app_1", true)
        expect(db.oauthClient.update).toHaveBeenCalledWith({ where: { id: "app_1" }, data: { disabled: true } })
        expect(db.oauthRefreshToken.updateMany).toHaveBeenCalledWith({
            where: { clientId: "client_abc", revoked: null },
            data: { revoked: expect.any(Date) },
        })
        expect(db.oauthAccessToken.deleteMany).toHaveBeenCalledWith({ where: { clientId: "client_abc" } })
        expect(db.$transaction).toHaveBeenCalled()
        // Without a consent older than the token, the MCP grant check cannot
        // revive pre-disable JWTs if the app is re-enabled.
        expect(db.oauthConsent.deleteMany).toHaveBeenCalledWith({ where: { clientId: "client_abc" } })
    })

    it("re-enabling an app does not touch tokens", async () => {
        db.oauthClient.findUnique.mockResolvedValue({ id: "app_1", clientId: "client_abc" })
        await AdminService.setOauthAppDisabled("app_1", false)
        expect(db.oauthClient.update).toHaveBeenCalledWith({ where: { id: "app_1" }, data: { disabled: false } })
        expect(db.oauthRefreshToken.updateMany).not.toHaveBeenCalled()
        expect(db.oauthAccessToken.deleteMany).not.toHaveBeenCalled()
        expect(db.oauthConsent.deleteMany).not.toHaveBeenCalled()
    })
})

describe("AdminService — form parity", () => {
    it("refuses to toggle active state on a taken-down form", async () => {
        db.form.findUnique.mockResolvedValue({ id: "form_1", takenDown: true })
        await expect(AdminService.toggleFormActive("form_1", true)).rejects.toBeInstanceOf(ValidationError)
    })

    it("hard-deletes attached drops before deleting the form", async () => {
        db.form.findUnique.mockResolvedValue({
            id: "form_1",
            submissions: [{ attachedDropId: "drop_1" }, { attachedDropId: null }],
        })
        // hardDeleteDrop loads the attached drop
        db.drop.findUnique.mockResolvedValue({
            id: "drop_1",
        })
        ;(deleteDropFilesAndReleaseQuota as Mock).mockResolvedValueOnce({
            files: [{ storageKey: "k1", s3UploadId: null, size: BigInt(10) }],
            deletedFiles: 1,
            releasedBytes: BigInt(10),
        })

        const result = await AdminService.hardDeleteForm("form_1")

        expect(deleteDropFilesAndReleaseQuota).toHaveBeenCalledWith("drop_1")
        expect(db.drop.deleteMany).toHaveBeenCalledWith({ where: { id: "drop_1" } })
        expect(db.user.update).not.toHaveBeenCalled()
        expect(db.form.delete).toHaveBeenCalledWith({ where: { id: "form_1" } })
        expect(result).toEqual({ success: true, attachedDropsDeleted: 1 })
    })
})
