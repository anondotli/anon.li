import { beforeEach, describe, expect, it, vi, type Mock } from "vitest"
import { AdminService } from "@/lib/services/admin"
import { prisma } from "@/lib/prisma"
import { ValidationError } from "@/lib/api-error-utils"

vi.mock("resend", () => ({
    Resend: class {
        emails = { send: vi.fn() }
    },
}))

vi.mock("@/lib/prisma", () => {
    const mock = {
        organization: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
        drop: { findMany: vi.fn(), findUnique: vi.fn(), delete: vi.fn() },
        orphanedFile: { createMany: vi.fn() },
        member: { findUnique: vi.fn(), count: vi.fn(), delete: vi.fn(), update: vi.fn() },
        organizationMemberKey: { deleteMany: vi.fn() },
        invitation: { findUnique: vi.fn(), update: vi.fn() },
        user: { findUnique: vi.fn(), update: vi.fn() },
        twoFactor: { deleteMany: vi.fn() },
        oauthApplication: { findUnique: vi.fn(), update: vi.fn(), delete: vi.fn() },
        oauthAccessToken: { deleteMany: vi.fn() },
        oauthConsent: { deleteMany: vi.fn() },
        form: { findUnique: vi.fn(), delete: vi.fn() },
        $transaction: vi.fn((arg: unknown) =>
            Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(mock),
        ),
    }
    return { prisma: mock }
})

type MethodName = "findUnique" | "update" | "delete" | "deleteMany" | "createMany" | "findMany" | "count"
type Model = Record<MethodName, Mock>
const db = prisma as unknown as {
    organization: Model
    drop: Model
    orphanedFile: Model
    member: Model
    organizationMemberKey: Model
    invitation: Model
    user: Model
    twoFactor: Model
    oauthApplication: Model
    oauthAccessToken: Model
    oauthConsent: Model
    form: Model
    $transaction: Mock
}

beforeEach(() => {
    vi.clearAllMocks()
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
            { files: [{ storageKey: "k1" }, { storageKey: "k2" }] },
            { files: [{ storageKey: "k3" }] },
        ])

        const result = await AdminService.deleteOrganization("org_1")

        expect(db.orphanedFile.createMany).toHaveBeenCalledWith({
            data: [{ storageKey: "k1" }, { storageKey: "k2" }, { storageKey: "k3" }],
        })
        expect(db.organization.delete).toHaveBeenCalledWith({ where: { id: "org_1" } })
        expect(result).toEqual({ success: true, orphanedFiles: 3 })
    })

    it("refuses to remove the only owner of an organization", async () => {
        db.member.findUnique.mockResolvedValue({ id: "m_1", role: "owner" })
        db.member.count.mockResolvedValue(1)

        await expect(AdminService.removeOrgMember("org_1", "user_1")).rejects.toBeInstanceOf(ValidationError)
        expect(db.member.delete).not.toHaveBeenCalled()
    })

    it("removes a member, drops their wrapped key, and flags key rotation", async () => {
        db.member.findUnique.mockResolvedValue({ id: "m_1", role: "member" })

        await AdminService.removeOrgMember("org_1", "user_1")

        expect(db.member.delete).toHaveBeenCalled()
        expect(db.organizationMemberKey.deleteMany).toHaveBeenCalledWith({
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

    it("sets ToS strikes to an explicit value", async () => {
        db.user.findUnique.mockResolvedValue({ id: "user_1" })
        await AdminService.setUserStrikes("user_1", 2)
        expect(db.user.update).toHaveBeenCalledWith({ where: { id: "user_1" }, data: { tosViolations: 2 } })
    })
})

describe("AdminService — OAuth applications", () => {
    it("revokes tokens and consents by clientId when deleting an app", async () => {
        db.oauthApplication.findUnique.mockResolvedValue({ id: "app_1", clientId: "client_abc" })

        await AdminService.deleteOauthApp("app_1")

        expect(db.oauthAccessToken.deleteMany).toHaveBeenCalledWith({ where: { clientId: "client_abc" } })
        expect(db.oauthConsent.deleteMany).toHaveBeenCalledWith({ where: { clientId: "client_abc" } })
        expect(db.oauthApplication.delete).toHaveBeenCalledWith({ where: { id: "app_1" } })
    })

    it("toggles the disabled flag", async () => {
        db.oauthApplication.findUnique.mockResolvedValue({ id: "app_1" })
        await AdminService.setOauthAppDisabled("app_1", true)
        expect(db.oauthApplication.update).toHaveBeenCalledWith({ where: { id: "app_1" }, data: { disabled: true } })
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
            files: [{ size: BigInt(10), storageKey: "k1" }],
            user: { id: "user_1", storageUsed: BigInt(100) },
        })

        const result = await AdminService.hardDeleteForm("form_1")

        expect(db.drop.delete).toHaveBeenCalledWith({ where: { id: "drop_1" } })
        expect(db.form.delete).toHaveBeenCalledWith({ where: { id: "form_1" } })
        expect(result).toEqual({ success: true, attachedDropsDeleted: 1 })
    })
})
