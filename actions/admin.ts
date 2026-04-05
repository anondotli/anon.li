"use server"

import { revalidatePath } from "next/cache"
import { z } from "zod"
import { AdminService } from "@/lib/services/admin"
import { runAdminAction } from "@/lib/safe-action"
import { createLogger } from "@/lib/logger"
import { audit } from "@/lib/services/audit"

const logger = createLogger("AdminActions")

// ============================================================================
// Drop Actions
// ============================================================================

export async function takedownDrop(dropId: string, reason: string) {
    return runAdminAction({}, async (_data, adminId) => {
        if (!reason.trim()) {
            throw new Error("Takedown reason is required")
        }

        await AdminService.takedownDrop(dropId, reason)

        audit({ action: "drop.takedown", actorId: adminId, targetId: dropId, metadata: { reason } })
        logger.info("Drop taken down", { adminId, dropId, reason })
        revalidatePath(`/admin/drops/${dropId}`)
        return { success: true }
    })
}

export async function deleteDrop(dropId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.hardDeleteDrop(dropId)
        logger.info("Drop deleted", { adminId, dropId })
        revalidatePath("/admin/drops")
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
    return runAdminAction({}, async (_data, adminId) => {
        if (userId === adminId) {
            throw new Error("Cannot ban your own account")
        }

        await AdminService.banUser(userId, options)

        audit({ action: "user.ban", actorId: adminId, targetId: userId, metadata: { full: options.full, aliasCreation: options.aliasCreation, fileUpload: options.fileUpload, reason: options.reason } })
        logger.info("User banned", { adminId, userId, options: { full: options.full, aliasCreation: options.aliasCreation, fileUpload: options.fileUpload } })
        revalidatePath(`/admin/users/${userId}`)
        return { success: true }
    })
}

export async function unbanUser(userId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.unbanUser(userId)
        audit({ action: "user.unban", actorId: adminId, targetId: userId })
        logger.info("User unbanned", { adminId, userId })
        revalidatePath(`/admin/users/${userId}`)
        return { success: true }
    })
}

export async function deleteUser(userId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        if (userId === adminId) {
            throw new Error("Cannot delete your own account")
        }
        await AdminService.deleteUser(userId)
        logger.info("User deleted", { adminId, userId })
        revalidatePath("/admin/users")
        return { success: true }
    })
}

// ============================================================================
// Alias Actions
// ============================================================================

export async function toggleAlias(aliasId: string, active: boolean) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.toggleAliasActive(aliasId, active)
        logger.info("Alias toggled", { adminId, aliasId, active })
        revalidatePath(`/admin/aliases/${aliasId}`)
        return { success: true }
    })
}

export async function deleteAlias(aliasId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.deleteAlias(aliasId)
        logger.info("Alias deleted", { adminId, aliasId })
        revalidatePath("/admin/aliases")
        return { success: true }
    })
}

// ============================================================================
// Domain Management
// ============================================================================

export async function forceVerifyDomain(domainId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.forceVerifyDomain(domainId)
        logger.info("Domain force-verified", { adminId, domainId })
        revalidatePath(`/admin/domains/${domainId}`)
        return { success: true }
    })
}

export async function deleteDomain(domainId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.deleteDomain(domainId)
        logger.info("Domain deleted", { adminId, domainId })
        revalidatePath("/admin/domains")
        return { success: true }
    })
}

// ============================================================================
// Recipient Management
// ============================================================================

export async function deleteRecipient(recipientId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.deleteRecipient(recipientId)
        logger.info("Recipient deleted", { adminId, recipientId })
        revalidatePath("/admin/recipients")
        return { success: true }
    })
}

// ============================================================================
// API Key Management
// ============================================================================

export async function revokeApiKey(keyId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.revokeApiKey(keyId)
        audit({ action: "api_key.delete", actorId: adminId, targetId: keyId })
        logger.info("API key revoked", { adminId, keyId })
        revalidatePath("/admin/api-keys")
        return { success: true }
    })
}

// ============================================================================
// Takedown Management
// ============================================================================

export async function restoreDrop(dropId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.restoreDrop(dropId)
        audit({ action: "drop.restore", actorId: adminId, targetId: dropId })
        logger.info("Drop restored", { adminId, dropId })
        revalidatePath("/admin/takedowns")
        return { success: true }
    })
}

export async function hardDeleteDrop(dropId: string) {
    return runAdminAction({}, async (_data, adminId) => {
        await AdminService.hardDeleteDrop(dropId)
        logger.info("Drop hard-deleted", { adminId, dropId })
        revalidatePath("/admin/takedowns")
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

export async function updateReport(
    reportId: string,
    data: { status: string; actionTaken?: string | null; notes?: string; takedownReason?: string }
) {
    return runAdminAction(
        { schema: updateReportSchema, data: { reportId, ...data } },
        async (validated, adminId) => {
            const { report: reportData } = await AdminService.getReportWithContext(reportId)
            const { serviceType, resourceId } = reportData

            // Handle takedown action
            if (validated.actionTaken === "takedown") {
                const takedownReason = validated.takedownReason || validated.notes || "Reported content violation"
                if (serviceType === "drop") {
                    await AdminService.takedownDrop(resourceId, takedownReason)
                } else if (serviceType === "alias") {
                    await AdminService.takedownAlias(resourceId)
                }
            }

            // Handle warning action
            if (validated.actionTaken === "warning") {
                const userId = await AdminService.getResourceOwnerUserId(serviceType, resourceId)
                if (userId) {
                    await AdminService.sendWarningEmail(userId, validated.notes || "Your content has been flagged for review.")
                }
            }

            // Handle ban action
            if (validated.actionTaken === "ban") {
                const userId = await AdminService.getResourceOwnerUserId(serviceType, resourceId)
                if (userId) {
                    const banOptions = serviceType === "drop"
                        ? { fileUpload: true, reason: validated.notes || "Banned due to abuse report" }
                        : { aliasCreation: true, reason: validated.notes || "Banned due to abuse report" }
                    await AdminService.banUser(userId, banOptions)
                }
            }

            await AdminService.resolveReport(
                reportId,
                validated.status,
                validated.notes || "",
                validated.actionTaken || null,
                adminId
            )

            if (validated.status === "resolved" || validated.status === "dismissed") {
                await AdminService.notifyReporter(reportId, validated.status)
            }

            const auditAction = validated.status === "resolved" ? "report.resolve" as const : "report.dismiss" as const
            audit({ action: auditAction, actorId: adminId, targetId: reportId, metadata: { status: validated.status, actionTaken: validated.actionTaken } })
            logger.info("Report updated", { adminId, reportId, status: validated.status, actionTaken: validated.actionTaken })
            revalidatePath("/admin/reports")
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
    return runAdminAction({}, async (_data, adminId) => {
        if (!Array.isArray(aliases)) {
            throw new Error("Invalid aliases format")
        }
        const result = await AdminService.updateReservedAliases(aliases)
        logger.info("Reserved aliases updated", { adminId, count: result.length })
        revalidatePath("/admin/settings")
        return result
    })
}
