"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { AdminService } from "@/lib/services/admin"
import { runAdminAction } from "@/lib/safe-action"
import { createLogger } from "@/lib/logger"
import { audit } from "@/lib/services/audit"

const logger = createLogger("AdminActions")

const idSchema = z.string().min(1).max(200)
const reasonSchema = z.string().trim().min(1, "Reason is required").max(1000)
const optionalReasonSchema = z.string().trim().max(1000).optional()

const takedownDropSchema = z.object({
    dropId: idSchema,
    reason: reasonSchema,
})

const takedownFormSchema = z.object({
    formId: idSchema,
    reason: reasonSchema,
})

const idOnlySchema = z.object({
    id: idSchema,
})

const banUserSchema = z.object({
    userId: idSchema,
    full: z.boolean().optional(),
    aliasCreation: z.boolean().optional(),
    fileUpload: z.boolean().optional(),
    reason: optionalReasonSchema,
}).refine(
    (data) => data.full || data.aliasCreation || data.fileUpload,
    "At least one ban option is required"
)

const toggleAliasSchema = z.object({
    aliasId: idSchema,
    active: z.boolean(),
})

const reservedAliasesSchema = z.object({
    aliases: z.array(z.string().max(100)).max(1000),
})

// ============================================================================
// Drop Actions
// ============================================================================

export async function takedownDrop(dropId: string, reason: string) {
    return runAdminAction({ schema: takedownDropSchema, data: { dropId, reason } }, async (validated, adminId) => {
        await AdminService.takedownDrop(validated.dropId, validated.reason)

        await audit({ action: "drop.takedown", actorId: adminId, targetId: validated.dropId, metadata: { reason: validated.reason } })
        logger.info("Drop taken down", { adminId, dropId: validated.dropId, reason: validated.reason })
        revalidatePath(`/admin/drops/${validated.dropId}`)
        revalidatePath("/admin/takedowns")
        return { success: true }
    })
}

export async function deleteDrop(dropId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: dropId } }, async (validated, adminId) => {
        await AdminService.hardDeleteDrop(validated.id)
        await audit({ action: "drop.delete", actorId: adminId, targetId: validated.id })
        logger.info("Drop deleted", { adminId, dropId: validated.id })
        revalidatePath("/admin/drops")
        revalidatePath("/admin/maintenance/storage")
        return { success: true }
    })
}

// ============================================================================
// User Actions
// ============================================================================

export async function banUser(
    userId: string,
    options: {
        full?: boolean
        aliasCreation?: boolean
        fileUpload?: boolean
        reason?: string
    }
) {
    return runAdminAction(
        { schema: banUserSchema, data: { userId, ...options } },
        async (validated, adminId) => {
        if (validated.userId === adminId) {
            throw new Error("Cannot ban your own account")
        }

        await AdminService.banUser(validated.userId, validated)

        await audit({ action: "user.ban", actorId: adminId, targetId: validated.userId, metadata: { full: validated.full, aliasCreation: validated.aliasCreation, fileUpload: validated.fileUpload, reason: validated.reason } })
        logger.info("User banned", { adminId, userId: validated.userId, options: { full: validated.full, aliasCreation: validated.aliasCreation, fileUpload: validated.fileUpload } })
        revalidatePath(`/admin/users/${validated.userId}`)
        revalidatePath("/admin/users")
        return { success: true }
    })
}

export async function unbanUser(userId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: userId } }, async (validated, adminId) => {
        await AdminService.unbanUser(validated.id)
        await audit({ action: "user.unban", actorId: adminId, targetId: validated.id })
        logger.info("User unbanned", { adminId, userId: validated.id })
        revalidatePath(`/admin/users/${validated.id}`)
        revalidatePath("/admin/users")
        return { success: true }
    })
}

export async function deleteUser(userId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: userId } }, async (validated, adminId) => {
        if (validated.id === adminId) {
            throw new Error("Cannot delete your own account")
        }
        const result = await AdminService.deleteUser(validated.id)
        await audit({ action: "user.delete_request", actorId: adminId, targetId: validated.id, metadata: { requestId: result.requestId } })
        logger.info("User deleted", { adminId, userId: validated.id, requestId: result.requestId })
        revalidatePath("/admin/users")
        revalidatePath("/admin/maintenance/deletion")
        revalidatePath("/admin/maintenance/storage")
        return { success: true }
    })
}

// ============================================================================
// Alias Actions
// ============================================================================

export async function toggleAlias(aliasId: string, active: boolean) {
    return runAdminAction({ schema: toggleAliasSchema, data: { aliasId, active } }, async (validated, adminId) => {
        await AdminService.toggleAliasActive(validated.aliasId, validated.active)
        await audit({ action: "alias.update", actorId: adminId, targetId: validated.aliasId, metadata: { active: validated.active } })
        logger.info("Alias toggled", { adminId, aliasId: validated.aliasId, active: validated.active })
        revalidatePath(`/admin/aliases/${validated.aliasId}`)
        revalidatePath("/admin/aliases")
        return { success: true }
    })
}

export async function deleteAlias(aliasId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: aliasId } }, async (validated, adminId) => {
        await AdminService.deleteAlias(validated.id)
        await audit({ action: "alias.delete", actorId: adminId, targetId: validated.id })
        logger.info("Alias deleted", { adminId, aliasId: validated.id })
        revalidatePath("/admin/aliases")
        return { success: true }
    })
}

// ============================================================================
// Domain Management
// ============================================================================

export async function forceVerifyDomain(domainId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: domainId } }, async (validated, adminId) => {
        await AdminService.forceVerifyDomain(validated.id)
        await audit({ action: "domain.verify", actorId: adminId, targetId: validated.id })
        logger.info("Domain force-verified", { adminId, domainId: validated.id })
        revalidatePath(`/admin/domains/${validated.id}`)
        revalidatePath("/admin/domains")
        return { success: true }
    })
}

export async function deleteDomain(domainId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: domainId } }, async (validated, adminId) => {
        await AdminService.deleteDomain(validated.id)
        await audit({ action: "domain.delete", actorId: adminId, targetId: validated.id })
        logger.info("Domain deleted", { adminId, domainId: validated.id })
        revalidatePath("/admin/domains")
        return { success: true }
    })
}

// ============================================================================
// Recipient Management
// ============================================================================

export async function deleteRecipient(recipientId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: recipientId } }, async (validated, adminId) => {
        await AdminService.deleteRecipient(validated.id)
        await audit({ action: "recipient.delete", actorId: adminId, targetId: validated.id })
        logger.info("Recipient deleted", { adminId, recipientId: validated.id })
        revalidatePath("/admin/recipients")
        return { success: true }
    })
}

// ============================================================================
// API Key Management
// ============================================================================

export async function revokeApiKey(keyId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: keyId } }, async (validated, adminId) => {
        await AdminService.revokeApiKey(validated.id)
        await audit({ action: "api_key.delete", actorId: adminId, targetId: validated.id })
        logger.info("API key revoked", { adminId, keyId: validated.id })
        revalidatePath("/admin/api-keys")
        return { success: true }
    })
}

// ============================================================================
// Takedown Management
// ============================================================================

export async function restoreDrop(dropId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: dropId } }, async (validated, adminId) => {
        await AdminService.restoreDrop(validated.id)
        await audit({ action: "drop.restore", actorId: adminId, targetId: validated.id })
        logger.info("Drop restored", { adminId, dropId: validated.id })
        revalidatePath("/admin/takedowns")
        revalidatePath(`/admin/drops/${validated.id}`)
        return { success: true }
    })
}

export async function hardDeleteDrop(dropId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: dropId } }, async (validated, adminId) => {
        await AdminService.hardDeleteDrop(validated.id)
        await audit({ action: "drop.delete", actorId: adminId, targetId: validated.id, metadata: { source: "takedowns" } })
        logger.info("Drop hard-deleted", { adminId, dropId: validated.id })
        revalidatePath("/admin/takedowns")
        revalidatePath("/admin/maintenance/storage")
        return { success: true }
    })
}

// ============================================================================
// Form Actions
// ============================================================================

export async function takedownForm(formId: string, reason: string) {
    return runAdminAction({ schema: takedownFormSchema, data: { formId, reason } }, async (validated, adminId) => {
        await AdminService.takedownForm(validated.formId, validated.reason)
        await audit({ action: "form.takedown", actorId: adminId, targetId: validated.formId, metadata: { reason: validated.reason } })
        logger.info("Form taken down", { adminId, formId: validated.formId, reason: validated.reason })
        revalidatePath(`/admin/forms/${validated.formId}`)
        revalidatePath("/admin/forms")
        revalidatePath("/admin/takedowns")
        return { success: true }
    })
}

export async function restoreForm(formId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: formId } }, async (validated, adminId) => {
        await AdminService.restoreForm(validated.id)
        await audit({ action: "form.restore", actorId: adminId, targetId: validated.id })
        logger.info("Form restored", { adminId, formId: validated.id })
        revalidatePath("/admin/takedowns")
        revalidatePath(`/admin/forms/${validated.id}`)
        revalidatePath("/admin/forms")
        return { success: true }
    })
}

// ============================================================================
// Report Management
// ============================================================================

const updateReportSchema = z.object({
    reportId: z.string().min(1),
    status: z.enum(["reviewed", "resolved", "dismissed"]),
    actionTaken: z.string().optional().nullable(),
    notes: z.string().optional(),
    takedownReason: z.string().optional()
})

export async function processDeletionRequest(requestId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: requestId } }, async (validated, adminId) => {
        await AdminService.processDeletionRequest(validated.id)
        await audit({ action: "deletion.process", actorId: adminId, targetId: validated.id })
        logger.info("Deletion request retried", { adminId, requestId: validated.id })
        revalidatePath("/admin/maintenance/deletion")
        revalidatePath("/admin/users")
        revalidatePath("/admin/maintenance/storage")
        return { success: true }
    })
}

export async function cleanupOrphanedFiles() {
    return runAdminAction({}, async (_data, adminId) => {
        const result = await AdminService.cleanupOrphanedFiles()
        await audit({ action: "storage.orphaned_cleanup", actorId: adminId, metadata: result })
        logger.info("Orphaned file cleanup triggered", { adminId, result })
        revalidatePath("/admin/maintenance/storage")
        revalidatePath("/admin")
        return result
    })
}

export async function updateReport(
    reportId: string,
    data: { status: string; actionTaken?: string | null; notes?: string; takedownReason?: string }
) {
    return runAdminAction(
        { schema: updateReportSchema, data: { reportId, ...data } },
        async (validated, adminId) => {
            const { report: reportData } = await AdminService.getReportWithContext(validated.reportId)
            const { serviceType, resourceId } = reportData

            // Handle takedown action
            if (validated.actionTaken === "takedown") {
                const takedownReason = validated.takedownReason || validated.notes || "Reported content violation"
                if (serviceType === "drop") {
                    await AdminService.takedownDrop(resourceId, takedownReason)
                } else if (serviceType === "alias") {
                    await AdminService.takedownAlias(resourceId)
                } else if (serviceType === "form") {
                    await AdminService.takedownForm(resourceId, takedownReason)
                }
            }

            // Handle warning action
            if (validated.actionTaken === "warning") {
                const userId = await AdminService.getResourceOwnerUserId(serviceType, resourceId)
                if (userId) {
                    await AdminService.sendWarningEmail(userId, validated.notes || "Your content has been flagged for review.")
                    await audit({ action: "admin.warning_sent", actorId: adminId, targetId: userId, metadata: { reportId: validated.reportId } })
                }
            }

            // Handle ban action
            if (validated.actionTaken === "ban") {
                const userId = await AdminService.getResourceOwnerUserId(serviceType, resourceId)
                if (userId) {
                    const banOptions = serviceType === "drop" || serviceType === "form"
                        ? { fileUpload: true, reason: validated.notes || "Banned due to abuse report" }
                        : { aliasCreation: true, reason: validated.notes || "Banned due to abuse report" }
                    await AdminService.banUser(userId, banOptions)
                }
            }

            await AdminService.resolveReport(
                validated.reportId,
                validated.status,
                validated.notes || "",
                validated.actionTaken || null,
                adminId
            )

            if (validated.status === "resolved" || validated.status === "dismissed") {
                await AdminService.notifyReporter(reportId, validated.status)
            }

            const auditAction = validated.status === "resolved"
                ? "report.resolve" as const
                : validated.status === "dismissed"
                    ? "report.dismiss" as const
                    : "report.review" as const
            await audit({ action: auditAction, actorId: adminId, targetId: validated.reportId, metadata: { status: validated.status, actionTaken: validated.actionTaken } })
            logger.info("Report updated", { adminId, reportId: validated.reportId, status: validated.status, actionTaken: validated.actionTaken })
            revalidatePath("/admin/reports")
            revalidatePath(`/admin/reports/${validated.reportId}`)
            return { success: true }
        }
    )
}

// ============================================================================
// Reserved Aliases Management (Database-backed)
// ============================================================================

const DEFAULT_RESERVED_ALIASES = [
    "admin", "administrator", "support", "help", "abuse", "postmaster",
    "hostmaster", "webmaster", "security", "info", "contact", "noreply",
    "no-reply", "mailer-daemon", "root", "www", "ftp", "mail", "email"
]

export async function getReservedAliases() {
    return runAdminAction({}, async () => {
        return AdminService.getReservedAliases(DEFAULT_RESERVED_ALIASES)
    })
}

export async function updateReservedAliases(aliases: string[]) {
    return runAdminAction({ schema: reservedAliasesSchema, data: { aliases } }, async (validated, adminId) => {
        const result = await AdminService.updateReservedAliases(validated.aliases)
        await audit({ action: "settings.reserved_aliases.update", actorId: adminId, metadata: { count: result.length } })
        logger.info("Reserved aliases updated", { adminId, count: result.length })
        revalidatePath("/admin/settings")
        return result
    })
}

// ============================================================================
// Organization Management
// ============================================================================

const orgRoleSchema = z.enum(["owner", "admin", "member"])
const suspendOrgSchema = z.object({ organizationId: idSchema, reason: reasonSchema })
const orgIdSchema = z.object({ organizationId: idSchema })
const setEnforce2FASchema = z.object({ organizationId: idSchema, enforce: z.boolean() })
const orgMemberSchema = z.object({ organizationId: idSchema, userId: idSchema })
const orgMemberRoleSchema = z.object({ organizationId: idSchema, userId: idSchema, role: orgRoleSchema })

function revalidateOrg(organizationId: string) {
    revalidatePath(`/admin/organizations/${organizationId}`)
    revalidatePath("/admin/organizations")
}

export async function suspendOrganization(organizationId: string, reason: string) {
    return runAdminAction({ schema: suspendOrgSchema, data: { organizationId, reason } }, async (validated, adminId) => {
        await AdminService.suspendOrganization(validated.organizationId, validated.reason)
        await audit({ action: "org.suspend", actorId: adminId, targetId: validated.organizationId, organizationId: validated.organizationId, metadata: { reason: validated.reason } })
        logger.info("Organization suspended", { adminId, organizationId: validated.organizationId })
        revalidateOrg(validated.organizationId)
        return { success: true }
    })
}

export async function unsuspendOrganization(organizationId: string) {
    return runAdminAction({ schema: orgIdSchema, data: { organizationId } }, async (validated, adminId) => {
        await AdminService.unsuspendOrganization(validated.organizationId)
        await audit({ action: "org.unsuspend", actorId: adminId, targetId: validated.organizationId, organizationId: validated.organizationId })
        logger.info("Organization unsuspended", { adminId, organizationId: validated.organizationId })
        revalidateOrg(validated.organizationId)
        return { success: true }
    })
}

export async function deleteOrganization(organizationId: string) {
    return runAdminAction({ schema: orgIdSchema, data: { organizationId } }, async (validated, adminId) => {
        const result = await AdminService.deleteOrganization(validated.organizationId)
        await audit({ action: "org.delete", actorId: adminId, targetId: validated.organizationId, organizationId: validated.organizationId, metadata: { orphanedFiles: result.orphanedFiles } })
        logger.info("Organization deleted", { adminId, organizationId: validated.organizationId, orphanedFiles: result.orphanedFiles })
        revalidatePath("/admin/organizations")
        revalidatePath("/admin/maintenance/storage")
        return { success: true }
    })
}

export async function setOrgEnforce2FA(organizationId: string, enforce: boolean) {
    return runAdminAction({ schema: setEnforce2FASchema, data: { organizationId, enforce } }, async (validated, adminId) => {
        await AdminService.setOrgEnforce2FA(validated.organizationId, validated.enforce)
        await audit({ action: validated.enforce ? "org.security.enforce_2fa_on" : "org.security.enforce_2fa_off", actorId: adminId, targetId: validated.organizationId, organizationId: validated.organizationId })
        logger.info("Org 2FA enforcement updated", { adminId, organizationId: validated.organizationId, enforce: validated.enforce })
        revalidateOrg(validated.organizationId)
        return { success: true }
    })
}

export async function recommendOrgKeyRotation(organizationId: string) {
    return runAdminAction({ schema: orgIdSchema, data: { organizationId } }, async (validated, adminId) => {
        await AdminService.recommendOrgKeyRotation(validated.organizationId)
        await audit({ action: "org.key_rotation.recommend", actorId: adminId, targetId: validated.organizationId, organizationId: validated.organizationId })
        logger.info("Org key rotation recommended", { adminId, organizationId: validated.organizationId })
        revalidateOrg(validated.organizationId)
        return { success: true }
    })
}

export async function removeOrgMember(organizationId: string, userId: string) {
    return runAdminAction({ schema: orgMemberSchema, data: { organizationId, userId } }, async (validated, adminId) => {
        const result = await AdminService.removeOrgMember(validated.organizationId, validated.userId)
        await audit({ action: "org.member.remove", actorId: adminId, targetId: validated.userId, organizationId: validated.organizationId, metadata: { role: result.role } })
        logger.info("Org member removed", { adminId, organizationId: validated.organizationId, userId: validated.userId })
        revalidateOrg(validated.organizationId)
        return { success: true }
    })
}

export async function updateOrgMemberRole(organizationId: string, userId: string, role: "owner" | "admin" | "member") {
    return runAdminAction({ schema: orgMemberRoleSchema, data: { organizationId, userId, role } }, async (validated, adminId) => {
        const result = await AdminService.updateOrgMemberRole(validated.organizationId, validated.userId, validated.role)
        await audit({ action: "org.member.role_change", actorId: adminId, targetId: validated.userId, organizationId: validated.organizationId, metadata: { from: result.previousRole, to: validated.role } })
        logger.info("Org member role changed", { adminId, organizationId: validated.organizationId, userId: validated.userId, role: validated.role })
        revalidateOrg(validated.organizationId)
        return { success: true }
    })
}

export async function cancelOrgInvitation(invitationId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: invitationId } }, async (validated, adminId) => {
        const result = await AdminService.cancelOrgInvitation(validated.id)
        await audit({ action: "org.invitation.cancel", actorId: adminId, targetId: validated.id, organizationId: result.organizationId })
        logger.info("Org invitation canceled", { adminId, invitationId: validated.id })
        revalidateOrg(result.organizationId)
        return { success: true }
    })
}

// ============================================================================
// User Account Editing
// ============================================================================

const setUserAdminSchema = z.object({ userId: idSchema, isAdmin: z.boolean() })
const setStorageLimitSchema = z.object({ userId: idSchema, storageLimit: z.number().int().min(0) })
const setStrikesSchema = z.object({ userId: idSchema, value: z.number().int().min(0).max(1000) })
const warnUserSchema = z.object({ userId: idSchema, reason: reasonSchema })

export async function setUserAdmin(userId: string, isAdmin: boolean) {
    return runAdminAction({ schema: setUserAdminSchema, data: { userId, isAdmin } }, async (validated, adminId) => {
        if (validated.userId === adminId && !validated.isAdmin) {
            throw new Error("Cannot revoke your own admin access")
        }
        await AdminService.setUserAdmin(validated.userId, validated.isAdmin)
        await audit({ action: "user.set_admin", actorId: adminId, targetId: validated.userId, metadata: { isAdmin: validated.isAdmin } })
        logger.info("User admin flag updated", { adminId, userId: validated.userId, isAdmin: validated.isAdmin })
        revalidatePath(`/admin/users/${validated.userId}`)
        revalidatePath("/admin/users")
        return { success: true }
    })
}

export async function setUserStorageLimit(userId: string, storageLimit: number) {
    return runAdminAction({ schema: setStorageLimitSchema, data: { userId, storageLimit } }, async (validated, adminId) => {
        await AdminService.setUserStorageLimit(validated.userId, BigInt(validated.storageLimit))
        await audit({ action: "user.set_storage_limit", actorId: adminId, targetId: validated.userId, metadata: { storageLimit: validated.storageLimit } })
        logger.info("User storage limit updated", { adminId, userId: validated.userId, storageLimit: validated.storageLimit })
        revalidatePath(`/admin/users/${validated.userId}`)
        return { success: true }
    })
}

export async function resetUser2FA(userId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: userId } }, async (validated, adminId) => {
        await AdminService.resetUser2FA(validated.id)
        await audit({ action: "user.reset_2fa", actorId: adminId, targetId: validated.id })
        logger.info("User 2FA reset", { adminId, userId: validated.id })
        revalidatePath(`/admin/users/${validated.id}`)
        return { success: true }
    })
}

export async function setUserStrikes(userId: string, value: number) {
    return runAdminAction({ schema: setStrikesSchema, data: { userId, value } }, async (validated, adminId) => {
        await AdminService.setUserStrikes(validated.userId, validated.value)
        await audit({ action: "user.adjust_strikes", actorId: adminId, targetId: validated.userId, metadata: { value: validated.value } })
        logger.info("User strikes set", { adminId, userId: validated.userId, value: validated.value })
        revalidatePath(`/admin/users/${validated.userId}`)
        revalidatePath("/admin/users")
        return { success: true }
    })
}

export async function warnUser(userId: string, reason: string) {
    return runAdminAction({ schema: warnUserSchema, data: { userId, reason } }, async (validated, adminId) => {
        await AdminService.sendWarningEmail(validated.userId, validated.reason)
        await audit({ action: "admin.warning_sent", actorId: adminId, targetId: validated.userId, metadata: { reason: validated.reason } })
        logger.info("Warning email sent", { adminId, userId: validated.userId })
        return { success: true }
    })
}

// ============================================================================
// OAuth / MCP Application Management
// ============================================================================

const oauthDisabledSchema = z.object({ appId: idSchema, disabled: z.boolean() })

export async function setOauthAppDisabled(appId: string, disabled: boolean) {
    return runAdminAction({ schema: oauthDisabledSchema, data: { appId, disabled } }, async (validated, adminId) => {
        await AdminService.setOauthAppDisabled(validated.appId, validated.disabled)
        await audit({ action: "oauth_app.update", actorId: adminId, targetId: validated.appId, metadata: { disabled: validated.disabled } })
        logger.info("OAuth app updated", { adminId, appId: validated.appId, disabled: validated.disabled })
        revalidatePath(`/admin/oauth/${validated.appId}`)
        revalidatePath("/admin/oauth")
        return { success: true }
    })
}

export async function deleteOauthApp(appId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: appId } }, async (validated, adminId) => {
        await AdminService.deleteOauthApp(validated.id)
        await audit({ action: "oauth_app.delete", actorId: adminId, targetId: validated.id })
        logger.info("OAuth app deleted", { adminId, appId: validated.id })
        revalidatePath("/admin/oauth")
        return { success: true }
    })
}

// ============================================================================
// Form Management (parity with Drops)
// ============================================================================

const toggleFormSchema = z.object({ formId: idSchema, active: z.boolean() })

export async function toggleFormActive(formId: string, active: boolean) {
    return runAdminAction({ schema: toggleFormSchema, data: { formId, active } }, async (validated, adminId) => {
        await AdminService.toggleFormActive(validated.formId, validated.active)
        await audit({ action: "form.update", actorId: adminId, targetId: validated.formId, metadata: { active: validated.active } })
        logger.info("Form active toggled", { adminId, formId: validated.formId, active: validated.active })
        revalidatePath(`/admin/forms/${validated.formId}`)
        revalidatePath("/admin/forms")
        return { success: true }
    })
}

export async function hardDeleteForm(formId: string) {
    return runAdminAction({ schema: idOnlySchema, data: { id: formId } }, async (validated, adminId) => {
        const result = await AdminService.hardDeleteForm(validated.id)
        await audit({ action: "form.delete", actorId: adminId, targetId: validated.id, metadata: { attachedDropsDeleted: result.attachedDropsDeleted } })
        logger.info("Form hard-deleted", { adminId, formId: validated.id, attachedDropsDeleted: result.attachedDropsDeleted })
        revalidatePath("/admin/forms")
        revalidatePath("/admin/maintenance/storage")
        return { success: true }
    })
}
