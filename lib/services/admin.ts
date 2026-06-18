import { prisma } from "@/lib/prisma"
import { Resend } from "resend"
import { DropTakedownEmail } from "@/components/email/drop-takedown"
import { FormTakedownEmail } from "@/components/email/form-takedown"
import { AbuseWarningEmail } from "@/components/email/abuse-warning"
import { ReportResolvedEmail } from "@/components/email/report-resolved"
import type { Prisma } from "@prisma/client"
import { createLogger } from "@/lib/logger"
import { NotFoundError, ValidationError } from "@/lib/api-error-utils"
import { safeDecryptReportKey } from "@/lib/report-crypto"

const SYSTEM_EMAIL_FROM = "anon.li <hi@anon.li>"

const logger = createLogger("AdminService")

let _resend: Resend | null = null
function getResend(): Resend {
    if (!_resend) {
        _resend = new Resend(process.env.AUTH_RESEND_KEY)
    }
    return _resend
}

interface BanOptions {
    full?: boolean
    aliasCreation?: boolean
    fileUpload?: boolean
    reason?: string
}

interface ListFilters {
    search?: string
    page?: number
    limit?: number
}

interface DomainFilters extends ListFilters {
    verified?: boolean
    userId?: string
}

export class AdminService {
    private static async _applyViolationStrike(userId: string): Promise<{ violations: number; banned: boolean }> {
        const result = await prisma.$queryRaw<{ tosViolations: number; banned: boolean }[]>`
            UPDATE "users"
            SET "tosViolations" = "tosViolations" + 1,
                "banned" = CASE WHEN "tosViolations" + 1 >= 3 THEN true ELSE "banned" END,
                "banReason" = CASE WHEN "tosViolations" + 1 >= 3 AND "banned" = false
                    THEN 'Automatic ban: 3 ToS violations reached'
                    ELSE "banReason" END
            WHERE "id" = ${userId}
            RETURNING "tosViolations", "banned"
        `
        const updated = result[0]
        if (!updated) return { violations: 0, banned: false }
        return { violations: updated.tosViolations, banned: updated.banned }
    }

    static async takedownDrop(dropId: string, reason: string) {
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: {
                user: { select: { id: true, email: true, tosViolations: true } }
            }
        })

        if (!drop) {
            throw new NotFoundError("Drop not found")
        }

        await prisma.drop.update({
            where: { id: dropId },
            data: {
                takenDown: true,
                takedownReason: reason,
                takenDownAt: new Date(),
                disabled: true,
                disabledAt: new Date()
            }
        })

        // If drop has owner, atomically increment violations and potentially ban
        if (drop.user) {
            const { violations: newViolations, banned: shouldBan } = await AdminService._applyViolationStrike(drop.user.id)

            // Send takedown notification email
            if (drop.user.email) {
                try {
                    await getResend().emails.send({
                        from: SYSTEM_EMAIL_FROM,
                        to: drop.user.email,
                        subject: "Content Takedown Notice",
                        react: DropTakedownEmail({
                            fileId: dropId,
                            reason,
                            strikeCount: newViolations,
                            isBanned: shouldBan
                        })
                    })
                } catch (error) {
                    logger.error("Failed to send takedown email", error)
                }
            }

            return { violations: newViolations, banned: shouldBan }
        }

        return { violations: 0, banned: false }
    }

    static async takedownForm(formId: string, reason: string) {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            select: {
                id: true,
                title: true,
                user: { select: { id: true, email: true, tosViolations: true } }
            }
        })

        if (!form) {
            throw new NotFoundError("Form not found")
        }

        await prisma.form.update({
            where: { id: formId },
            data: {
                takenDown: true,
                takedownReason: reason,
                takenDownAt: new Date(),
                disabledByUser: true,
                active: false
            }
        })

        // form.user is null for an org-owned form whose creating user was deleted
        // (userId SetNull). There's no individual to strike or notify in that case.
        let newViolations = 0
        let shouldBan = false
        if (form.user) {
            const strike = await AdminService._applyViolationStrike(form.user.id)
            newViolations = strike.violations
            shouldBan = strike.banned

            if (form.user.email) {
                try {
                    await getResend().emails.send({
                        from: SYSTEM_EMAIL_FROM,
                        to: form.user.email,
                        subject: "Content Takedown Notice",
                        react: FormTakedownEmail({
                            formId,
                            formTitle: form.title,
                            reason,
                            strikeCount: newViolations,
                            isBanned: shouldBan
                        })
                    })
                } catch (error) {
                    logger.error("Failed to send form takedown email", error)
                }
            }
        }

        return { violations: newViolations, banned: shouldBan }
    }

    static async restoreForm(formId: string) {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            select: { id: true, takenDown: true, userId: true }
        })

        if (!form) {
            throw new NotFoundError("Form not found")
        }

        if (!form.takenDown) {
            throw new ValidationError("Form is not taken down")
        }

        await prisma.$transaction(async (tx) => {
            await tx.form.update({
                where: { id: formId },
                data: {
                    takenDown: false,
                    takedownReason: null,
                    takenDownAt: null,
                    disabledByUser: false,
                    active: true
                }
            })

            await tx.$executeRaw`
                UPDATE "users"
                SET "tosViolations" = GREATEST("tosViolations" - 1, 0)
                WHERE "id" = ${form.userId}
            `
        })

        return { success: true }
    }

    static async takedownAlias(aliasEmail: string) {
        const alias = await prisma.alias.findFirst({
            where: { email: aliasEmail },
            include: {
                user: { select: { id: true, email: true, tosViolations: true } }
            }
        })

        if (!alias) {
            throw new NotFoundError("Alias not found")
        }

        // Deactivate the alias
        await prisma.alias.update({
            where: { id: alias.id },
            data: { active: false }
        })

        // Atomically increment violations on the user. alias.userId is null for an
        // org-owned alias whose creating user was deleted (userId SetNull) — no
        // individual to strike in that case.
        if (!alias.userId) {
            return { violations: 0, banned: false }
        }
        return AdminService._applyViolationStrike(alias.userId)
    }

    static async sendWarningEmail(userId: string, reason: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { email: true, tosViolations: true }
        })

        if (!user?.email) return

        try {
            await getResend().emails.send({
                from: SYSTEM_EMAIL_FROM,
                to: user.email,
                subject: "Policy Warning - anon.li",
                react: AbuseWarningEmail({ reason })
            })
        } catch (error) {
            logger.error("Failed to send warning email", error)
        }
    }

    static async banUser(userId: string, options: BanOptions) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                email: true,
                banned: true,
                banAliasCreation: true,
                banFileUpload: true,
                banReason: true,
            }
        })

        if (!user) {
            throw new NotFoundError("User not found")
        }

        // OR-merge new flags with existing to avoid overwriting existing bans
        await prisma.user.update({
            where: { id: userId },
            data: {
                banned: user.banned || (options.full ?? false),
                banAliasCreation: user.banAliasCreation || (options.aliasCreation ?? false),
                banFileUpload: user.banFileUpload || (options.fileUpload ?? false),
                banReason: options.reason || user.banReason,
            }
        })

        return { success: true }
    }

    static async unbanUser(userId: string, resetStrikes: boolean = false) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true }
        })

        if (!user) {
            throw new NotFoundError("User not found")
        }

        await prisma.user.update({
            where: { id: userId },
            data: {
                banned: false,
                banAliasCreation: false,
                banFileUpload: false,
                banReason: null,
                ...(resetStrikes && { tosViolations: 0 })
            }
        })

        return { success: true }
    }

    static async deleteUser(userId: string) {
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { id: true }
        })

        if (!user) {
            throw new NotFoundError("User not found")
        }

        const { DeletionService } = await import("@/lib/services/deletion")
        const requestId = await DeletionService.requestDeletion(userId)

        return { success: true, requestId }
    }

    static async deleteAlias(aliasId: string) {
        const alias = await prisma.alias.findUnique({
            where: { id: aliasId },
            select: { id: true }
        })

        if (!alias) {
            throw new NotFoundError("Alias not found")
        }

        await prisma.alias.delete({
            where: { id: aliasId }
        })

        return { success: true }
    }

    static async hardDeleteDrop(dropId: string) {
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: { files: true, user: { select: { id: true, storageUsed: true } } }
        })

        if (!drop) {
            throw new NotFoundError("Drop not found")
        }

        // Calculate total size for storage quota update
        const totalSize = drop.files.reduce((sum, file) => sum + file.size, BigInt(0))

        // Create orphaned file records for cleanup job
        const storageKeys = drop.files.map((f) => f.storageKey)
        if (storageKeys.length > 0) {
            await prisma.orphanedFile.createMany({
                data: storageKeys.map((key) => ({ storageKey: key }))
            })
        }

        // Delete from database (files cascade)
        await prisma.drop.delete({
            where: { id: dropId }
        })

        // Update user's storage quota if applicable
        if (drop.user) {
            const newStorageUsed = drop.user.storageUsed - totalSize
            await prisma.user.update({
                where: { id: drop.user.id },
                data: {
                    storageUsed: newStorageUsed < 0 ? 0 : newStorageUsed
                }
            })
        }

        return { success: true, filesDeleted: drop.files.length }
    }

    static async resolveReport(
        reportId: string,
        status: "reviewed" | "resolved" | "dismissed",
        notes: string,
        actionTaken: string | null,
        adminId: string
    ) {
        const report = await prisma.abuseReport.findUnique({
            where: { id: reportId },
            select: { id: true }
        })

        if (!report) {
            throw new NotFoundError("Report not found")
        }

        await prisma.abuseReport.update({
            where: { id: reportId },
            data: {
                status,
                reviewNotes: notes,
                actionTaken,
                reviewedAt: new Date(),
                reviewedBy: adminId
            }
        })

        return { success: true }
    }

    static async notifyReporter(reportId: string, status: string) {
        const report = await prisma.abuseReport.findUnique({
            where: { id: reportId },
            select: { contactEmail: true },
        })

        if (!report?.contactEmail) return

        try {
            await getResend().emails.send({
                from: SYSTEM_EMAIL_FROM,
                to: report.contactEmail,
                subject: status === "resolved"
                    ? "Your abuse report has been resolved"
                    : "Your abuse report has been reviewed",
                react: ReportResolvedEmail({ status })
            })
        } catch (error) {
            logger.error("Failed to send reporter notification email", error)
        }
    }

    static async listDomains(filters: DomainFilters = {}) {
        const { search, page = 1, limit = 50, verified, userId } = filters
        const skip = (page - 1) * limit

        const where: Prisma.DomainWhereInput = {}

        if (verified !== undefined) where.verified = verified
        if (userId) where.userId = userId
        if (search) {
            where.domain = { contains: search, mode: "insensitive" }
        }

        const [domains, total] = await Promise.all([
            prisma.domain.findMany({
                where,
                include: {
                    user: { select: { id: true, email: true, name: true } }
                },
                orderBy: { createdAt: "desc" },
                skip,
                take: limit
            }),
            prisma.domain.count({ where })
        ])

        // Batch alias count query instead of N+1
        const domainNames = domains.map((d) => d.domain)
        const aliasCounts = await prisma.alias.groupBy({
            by: ["domain"],
            where: { domain: { in: domainNames } },
            _count: { domain: true }
        }) as unknown as { domain: string; _count: { domain: number } }[]

        const countsMap = new Map<string, number>()
        aliasCounts.forEach((ac) => {
            countsMap.set(ac.domain, ac._count.domain)
        })

        const domainsWithCounts = domains.map((domain) => ({
            ...domain,
            aliasCount: countsMap.get(domain.domain) ?? 0
        }))

        return {
            domains: domainsWithCounts,
            total,
            page,
            totalPages: Math.ceil(total / limit)
        }
    }

    static async deleteDomain(domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId },
            select: { id: true, domain: true }
        })

        if (!domain) {
            throw new NotFoundError("Domain not found")
        }

        await prisma.domain.delete({ where: { id: domainId } })

        return { success: true }
    }

    static async forceVerifyDomain(domainId: string) {
        const domain = await prisma.domain.findUnique({
            where: { id: domainId },
            select: { id: true, domain: true }
        })

        if (!domain) {
            throw new NotFoundError("Domain not found")
        }

        await prisma.domain.update({
            where: { id: domainId },
            data: {
                verified: true,
                ownershipVerified: true,
                mxVerified: true,
                spfVerified: true,
                dnsVerified: true,
                dkimVerified: true
            }
        })

        return { success: true }
    }

    static async deleteRecipient(recipientId: string) {
        const recipient = await prisma.recipient.findUnique({
            where: { id: recipientId },
            select: { id: true, email: true }
        })

        if (!recipient) {
            throw new NotFoundError("Recipient not found")
        }

        await prisma.recipient.delete({ where: { id: recipientId } })

        return { success: true }
    }

    static async revokeApiKey(keyId: string) {
        const apiKey = await prisma.apiKey.findUnique({
            where: { id: keyId },
            select: { id: true, keyPrefix: true, userId: true }
        })

        if (!apiKey) {
            throw new NotFoundError("API key not found")
        }

        await prisma.apiKey.delete({ where: { id: keyId } })

        return { success: true }
    }

    static async restoreDrop(dropId: string) {
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            select: { id: true, takenDown: true, userId: true }
        })

        if (!drop) {
            throw new NotFoundError("Drop not found")
        }

        if (!drop.takenDown) {
            throw new ValidationError("Drop is not taken down")
        }

        await prisma.$transaction(async (tx) => {
            await tx.drop.update({
                where: { id: dropId },
                data: {
                    takenDown: false,
                    takedownReason: null,
                    takenDownAt: null,
                    disabled: false,
                    disabledAt: null
                }
            })

            // Decrement strikes on the user (clamp to >= 0)
            if (drop.userId) {
                await tx.$executeRaw`
                    UPDATE "users"
                    SET "tosViolations" = GREATEST("tosViolations" - 1, 0)
                    WHERE "id" = ${drop.userId}
                `
            }
        })

        return { success: true }
    }

    static async processDeletionRequest(requestId: string) {
        const request = await prisma.deletionRequest.findUnique({
            where: { id: requestId },
            select: { id: true, status: true }
        })

        if (!request) {
            throw new NotFoundError("Deletion request not found")
        }

        if (request.status === "completed") {
            throw new ValidationError("Deletion request is already completed")
        }

        const { DeletionService } = await import("@/lib/services/deletion")
        await DeletionService.processDeletion(requestId)
        await DeletionService.completeDeletion(requestId)

        return { success: true }
    }

    static async cleanupOrphanedFiles() {
        const { DropCleanupService } = await import("@/lib/services/drop-cleanup")
        return DropCleanupService.cleanupOrphanedFiles(false)
    }

    static async toggleAliasActive(aliasId: string, active: boolean) {
        const alias = await prisma.alias.findUnique({
            where: { id: aliasId },
            select: { id: true, email: true }
        })

        if (!alias) {
            throw new NotFoundError("Alias not found")
        }

        await prisma.alias.update({
            where: { id: aliasId },
            data: { active }
        })

        return { success: true }
    }

    static async getReportWithContext(reportId: string) {
        const rawReport = await prisma.abuseReport.findUnique({
            where: { id: reportId }
        })

        if (!rawReport) {
            throw new NotFoundError("Report not found")
        }

        // Decrypt decryption key if it was encrypted
        const report = rawReport.decryptionKey && rawReport.decryptionKeyEncrypted
            ? { ...rawReport, decryptionKey: safeDecryptReportKey(rawReport.decryptionKey) }
            : rawReport

        let drop: {
            id: string
            disabled: boolean
            takenDown: boolean
            takedownReason: string | null
            customKey: boolean
            downloads: number
            maxDownloads: number | null
            expiresAt: Date | null
            uploadComplete: boolean
            createdAt: Date
            fileCount: number
            totalSize: number
            user: {
                id: string
                email: string
                tosViolations: number
                banned: boolean
                banAliasCreation: boolean
                banFileUpload: boolean
                isAdmin: boolean
            } | null
        } | null = null

        let alias = null
        let form: {
            id: string
            title: string
            active: boolean
            disabledByUser: boolean
            takenDown: boolean
            takedownReason: string | null
            customKey: boolean
            allowFileUploads: boolean
            submissionsCount: number
            maxSubmissions: number | null
            closesAt: Date | null
            createdAt: Date
            user: {
                id: string
                email: string
                tosViolations: number
                banned: boolean
                banAliasCreation: boolean
                banFileUpload: boolean
                isAdmin: boolean
            } | null
        } | null = null

        if (report.serviceType === "drop") {
            const dropData = await prisma.drop.findUnique({
                where: { id: report.resourceId },
                select: {
                    id: true,
                    disabled: true,
                    takenDown: true,
                    takedownReason: true,
                    customKey: true,
                    downloads: true,
                    maxDownloads: true,
                    expiresAt: true,
                    uploadComplete: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            tosViolations: true,
                            banned: true,
                            banAliasCreation: true,
                            banFileUpload: true,
                            isAdmin: true
                        }
                    },
                    files: { select: { size: true } }
                }
            })

            if (dropData) {
                const fileCount = dropData.files.length
                const totalSize = dropData.files.reduce((sum, f) => sum + f.size, BigInt(0))
                drop = {
                    id: dropData.id,
                    disabled: dropData.disabled,
                    takenDown: dropData.takenDown,
                    takedownReason: dropData.takedownReason,
                    customKey: dropData.customKey,
                    downloads: dropData.downloads,
                    maxDownloads: dropData.maxDownloads,
                    expiresAt: dropData.expiresAt,
                    uploadComplete: dropData.uploadComplete,
                    createdAt: dropData.createdAt,
                    user: dropData.user,
                    fileCount,
                    totalSize: Number(totalSize)
                }
            }
        } else if (report.serviceType === "alias") {
            alias = await prisma.alias.findFirst({
                where: { email: report.resourceId },
                select: {
                    id: true,
                    email: true,
                    active: true,
                    emailsReceived: true,
                    emailsBlocked: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            tosViolations: true,
                            banned: true,
                            banAliasCreation: true,
                            isAdmin: true
                        }
                    }
                }
            })
        } else if (report.serviceType === "form") {
            form = await prisma.form.findUnique({
                where: { id: report.resourceId },
                select: {
                    id: true,
                    title: true,
                    active: true,
                    disabledByUser: true,
                    takenDown: true,
                    takedownReason: true,
                    customKey: true,
                    allowFileUploads: true,
                    submissionsCount: true,
                    maxSubmissions: true,
                    closesAt: true,
                    createdAt: true,
                    user: {
                        select: {
                            id: true,
                            email: true,
                            tosViolations: true,
                            banned: true,
                            banAliasCreation: true,
                            banFileUpload: true,
                            isAdmin: true
                        }
                    }
                }
            })
        }

        const [previousReports, totalPreviousReports] = await Promise.all([
            prisma.abuseReport.findMany({
                where: { resourceId: report.resourceId, id: { not: reportId } },
                select: { id: true, status: true, reason: true, createdAt: true, actionTaken: true },
                orderBy: { createdAt: "desc" },
                take: 20
            }),
            prisma.abuseReport.count({
                where: { resourceId: report.resourceId, id: { not: reportId } }
            })
        ])

        return {
            report,
            drop,
            alias,
            form,
            previousReports: { count: totalPreviousReports, recent: previousReports }
        }
    }

    /**
     * Returns the userId that owns a drop or alias resource — used when taking action
     * (warning, ban) in response to an abuse report.
     */
    static async getResourceOwnerUserId(serviceType: string, resourceId: string): Promise<string | null> {
        if (serviceType === "drop") {
            const drop = await prisma.drop.findUnique({
                where: { id: resourceId },
                select: { userId: true }
            })
            return drop?.userId ?? null
        } else if (serviceType === "alias") {
            const alias = await prisma.alias.findFirst({
                where: { email: resourceId },
                select: { userId: true }
            })
            return alias?.userId ?? null
        } else if (serviceType === "form") {
            const form = await prisma.form.findUnique({
                where: { id: resourceId },
                select: { userId: true }
            })
            return form?.userId ?? null
        }
        return null
    }

    static async getReservedAliases(defaults: string[]): Promise<string[]> {
        const reserved = await prisma.reservedAlias.findMany({
            select: { alias: true },
            orderBy: { alias: "asc" }
        })

        if (reserved.length === 0) {
            await prisma.reservedAlias.createMany({
                data: defaults.map(alias => ({ alias })),
                skipDuplicates: true
            })
            return [...defaults].sort()
        }

        return reserved.map(r => r.alias)
    }

    static async updateReservedAliases(aliases: string[]): Promise<string[]> {
        const normalized = aliases
            .map(a => a.toLowerCase().trim())
            .filter(a => a.length > 0 && /^[a-z0-9._-]+$/.test(a))

        await prisma.$transaction(async (tx) => {
            await tx.reservedAlias.deleteMany({})
            if (normalized.length > 0) {
                await tx.reservedAlias.createMany({
                    data: normalized.map(alias => ({ alias }))
                })
            }
        })

        return normalized.sort()
    }

    // ========================================================================
    // Organization Management
    // ========================================================================

    static async suspendOrganization(organizationId: string, reason: string) {
        const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
        if (!org) throw new NotFoundError("Organization not found")
        await prisma.organization.update({
            where: { id: organizationId },
            data: { suspendedAt: new Date(), suspendedReason: reason },
        })
        return { success: true }
    }

    static async unsuspendOrganization(organizationId: string) {
        const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
        if (!org) throw new NotFoundError("Organization not found")
        await prisma.organization.update({
            where: { id: organizationId },
            data: { suspendedAt: null, suspendedReason: null },
        })
        return { success: true }
    }

    static async deleteOrganization(organizationId: string) {
        const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
        if (!org) throw new NotFoundError("Organization not found")

        // Enqueue R2 blob cleanup for org-owned drops BEFORE the cascade delete
        // removes their DropFile rows (Drop.organization is onDelete: Cascade),
        // otherwise the blobs orphan with no OrphanedFile record to reap them.
        const orgDrops = await prisma.drop.findMany({
            where: { organizationId },
            select: { files: { select: { storageKey: true } } },
        })
        const storageKeys = orgDrops.flatMap((d) => d.files.map((f) => f.storageKey))
        if (storageKeys.length > 0) {
            await prisma.orphanedFile.createMany({ data: storageKeys.map((key) => ({ storageKey: key })) })
        }

        await prisma.organization.delete({ where: { id: organizationId } })
        return { success: true, orphanedFiles: storageKeys.length }
    }

    static async setOrgEnforce2FA(organizationId: string, enforce: boolean) {
        const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
        if (!org) throw new NotFoundError("Organization not found")
        await prisma.organization.update({ where: { id: organizationId }, data: { enforce2FA: enforce } })
        return { success: true }
    }

    static async recommendOrgKeyRotation(organizationId: string) {
        const org = await prisma.organization.findUnique({ where: { id: organizationId }, select: { id: true } })
        if (!org) throw new NotFoundError("Organization not found")
        await prisma.organization.update({
            where: { id: organizationId },
            data: { keyRotationRecommendedAt: new Date() },
        })
        return { success: true }
    }

    static async removeOrgMember(organizationId: string, userId: string) {
        const member = await prisma.member.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { id: true, role: true },
        })
        if (!member) throw new NotFoundError("Member not found")
        if (member.role === "owner") {
            const ownerCount = await prisma.member.count({ where: { organizationId, role: "owner" } })
            if (ownerCount <= 1) throw new ValidationError("Cannot remove the only owner of an organization")
        }
        // Drop the member, their wrapped org-vault key, and flag key rotation
        // (soft revocation, mirroring the dashboard remove-member flow).
        await prisma.$transaction([
            prisma.member.delete({ where: { organizationId_userId: { organizationId, userId } } }),
            prisma.organizationMemberKey.deleteMany({ where: { organizationId, userId } }),
            prisma.organization.update({
                where: { id: organizationId },
                data: { keyRotationRecommendedAt: new Date() },
            }),
        ])
        return { success: true, role: member.role }
    }

    static async updateOrgMemberRole(
        organizationId: string,
        userId: string,
        role: "owner" | "admin" | "member",
    ) {
        const member = await prisma.member.findUnique({
            where: { organizationId_userId: { organizationId, userId } },
            select: { id: true, role: true },
        })
        if (!member) throw new NotFoundError("Member not found")
        if (member.role === "owner" && role !== "owner") {
            const ownerCount = await prisma.member.count({ where: { organizationId, role: "owner" } })
            if (ownerCount <= 1) throw new ValidationError("Cannot demote the only owner of an organization")
        }
        await prisma.member.update({
            where: { organizationId_userId: { organizationId, userId } },
            data: { role },
        })
        return { success: true, previousRole: member.role }
    }

    static async cancelOrgInvitation(invitationId: string) {
        const invitation = await prisma.invitation.findUnique({
            where: { id: invitationId },
            select: { id: true, organizationId: true },
        })
        if (!invitation) throw new NotFoundError("Invitation not found")
        await prisma.invitation.update({ where: { id: invitationId }, data: { status: "canceled" } })
        return { success: true, organizationId: invitation.organizationId }
    }

    // ========================================================================
    // User Account Editing
    // ========================================================================

    static async setUserAdmin(userId: string, isAdmin: boolean) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
        if (!user) throw new NotFoundError("User not found")
        await prisma.user.update({ where: { id: userId }, data: { isAdmin } })
        return { success: true }
    }

    static async setUserStorageLimit(userId: string, storageLimit: bigint) {
        if (storageLimit < BigInt(0)) throw new ValidationError("Storage limit cannot be negative")
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
        if (!user) throw new NotFoundError("User not found")
        await prisma.user.update({ where: { id: userId }, data: { storageLimit } })
        return { success: true }
    }

    static async resetUser2FA(userId: string) {
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
        if (!user) throw new NotFoundError("User not found")
        await prisma.$transaction([
            prisma.twoFactor.deleteMany({ where: { userId } }),
            prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false } }),
        ])
        return { success: true }
    }

    static async setUserStrikes(userId: string, value: number) {
        if (value < 0) throw new ValidationError("Strike count cannot be negative")
        const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true } })
        if (!user) throw new NotFoundError("User not found")
        await prisma.user.update({ where: { id: userId }, data: { tosViolations: value } })
        return { success: true }
    }

    // ========================================================================
    // OAuth / MCP Applications
    // ========================================================================

    static async setOauthAppDisabled(appId: string, disabled: boolean) {
        const app = await prisma.oauthApplication.findUnique({ where: { id: appId }, select: { id: true } })
        if (!app) throw new NotFoundError("Application not found")
        await prisma.oauthApplication.update({ where: { id: appId }, data: { disabled } })
        return { success: true }
    }

    static async deleteOauthApp(appId: string) {
        const app = await prisma.oauthApplication.findUnique({
            where: { id: appId },
            select: { id: true, clientId: true },
        })
        if (!app) throw new NotFoundError("Application not found")
        // Access tokens and consents key off clientId (no FK relation), so revoke
        // them explicitly when the application is deleted.
        await prisma.$transaction([
            prisma.oauthAccessToken.deleteMany({ where: { clientId: app.clientId } }),
            prisma.oauthConsent.deleteMany({ where: { clientId: app.clientId } }),
            prisma.oauthApplication.delete({ where: { id: appId } }),
        ])
        return { success: true }
    }

    // ========================================================================
    // Form Management (parity with Drops)
    // ========================================================================

    static async toggleFormActive(formId: string, active: boolean) {
        const form = await prisma.form.findUnique({ where: { id: formId }, select: { id: true, takenDown: true } })
        if (!form) throw new NotFoundError("Form not found")
        if (form.takenDown) throw new ValidationError("Restore the form before changing its active state")
        await prisma.form.update({ where: { id: formId }, data: { active } })
        return { success: true }
    }

    static async hardDeleteForm(formId: string) {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            select: { id: true, submissions: { select: { attachedDropId: true } } },
        })
        if (!form) throw new NotFoundError("Form not found")

        // Submission rows cascade with the form, but their attached drops (file
        // uploads) are SetNull and would orphan — hard-delete each so its files,
        // OrphanedFile records, and the owner's storage quota are handled.
        const attachedDropIds = form.submissions
            .map((s) => s.attachedDropId)
            .filter((id): id is string => Boolean(id))
        for (const dropId of attachedDropIds) {
            await this.hardDeleteDrop(dropId)
        }

        // Delete the form — submissions, owner key, and upload tokens cascade.
        await prisma.form.delete({ where: { id: formId } })
        return { success: true, attachedDropsDeleted: attachedDropIds.length }
    }
}
