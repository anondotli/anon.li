import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getDisplayPlanLimits, getDropLimits, getEffectiveTier } from "@/lib/limits"
import { rateLimit } from "@/lib/rate-limit"
import { createLogger } from "@/lib/logger"
import { requireSession } from "@/lib/api-auth"

const logger = createLogger("UserExportAPI")

/**
 * GET /api/user/export
 * Generates a portable personal-workspace data summary for the authenticated user.
 * Credential secrets, encrypted response payloads, file contents, and team-owned
 * resources are intentionally excluded.
 */
export async function GET() {
    try {
        const result = await requireSession()
        if (!result) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }
        const userId = result.userId

        // Rate limit check - heavy database operation
        const rateLimited = await rateLimit("userExport", userId)
        if (rateLimited) return rateLimited

        // Fetch user with all related data
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: {
                id: true,
                name: true,
                email: true,
                emailVerified: true,
                storageUsed: true,
                storageLimit: true,
                createdAt: true,
                referralPlusUntil: true,
                subscriptions: {
                    where: {
                        organizationId: null,
                        status: { in: ["active", "trialing"] },
                    },
                    orderBy: { createdAt: "desc" },
                    select: {
                        provider: true,
                        product: true,
                        tier: true,
                        status: true,
                        currentPeriodStart: true,
                        currentPeriodEnd: true,
                        cancelAtPeriodEnd: true,
                        createdAt: true,
                    },
                },
            }
        })

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        // Org-controlled resources have a separate organization export. Keep
        // this download strictly personal even when the user created team rows.
        const personalWhere = { userId, organizationId: null } as const
        const [aliases, domains, drops, forms, recipients, apiKeys] = await Promise.all([
            prisma.alias.findMany({
                where: personalWhere,
                select: {
                    email: true,
                    localPart: true,
                    domain: true,
                    active: true,
                    format: true,
                    recipient: {
                        select: {
                            email: true,
                        },
                    },
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            prisma.domain.findMany({
                where: personalWhere,
                select: {
                    domain: true,
                    verified: true,
                    ownershipVerified: true,
                    mxVerified: true,
                    spfVerified: true,
                    dkimVerified: true,
                    dkimSelector: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            prisma.drop.findMany({
                where: personalWhere,
                select: {
                    id: true,
                    encryptedTitle: true,
                    encryptedMessage: true,
                    downloads: true,
                    maxDownloads: true,
                    expiresAt: true,
                    customKey: true,
                    hideBranding: true,
                    deletedAt: true,
                    createdAt: true,
                    updatedAt: true,
                    files: {
                        select: {
                            id: true,
                            encryptedName: true,
                            size: true,
                            mimeType: true,
                        },
                    },
                },
            }),
            prisma.form.findMany({
                where: personalWhere,
                select: {
                    id: true,
                    title: true,
                    description: true,
                    schemaJson: true,
                    active: true,
                    disabledByUser: true,
                    customKey: true,
                    maxSubmissions: true,
                    closesAt: true,
                    hideBranding: true,
                    allowFileUploads: true,
                    submissionsCount: true,
                    takenDown: true,
                    deletedAt: true,
                    createdAt: true,
                    updatedAt: true,
                },
            }),
            prisma.recipient.findMany({
                where: personalWhere,
                select: {
                    email: true,
                    verified: true,
                    isDefault: true,
                    pgpFingerprint: true,
                    pgpKeyName: true,
                    createdAt: true,
                },
            }),
            prisma.apiKey.findMany({
                where: personalWhere,
                select: {
                    keyPrefix: true,
                    label: true,
                    createdAt: true,
                },
            }),
        ])

        // Get plan info
        const aliasLimits = getDisplayPlanLimits(user)
        const dropLimits = getDropLimits(user)
        const tier = getEffectiveTier(user)
        const primarySub = user.subscriptions[0] ?? null

        // Build export data
        const exportData = {
            exportedAt: new Date().toISOString(),
            profile: {
                id: user.id,
                name: user.name,
                email: user.email,
                emailVerified: user.emailVerified,
                createdAt: user.createdAt,
            },
            subscription: {
                tier,
                provider: primarySub?.provider ?? null,
                product: primarySub?.product ?? null,
                status: primarySub?.status ?? null,
                currentPeriodEnd: primarySub?.currentPeriodEnd ?? null,
                cancelAtPeriodEnd: primarySub?.cancelAtPeriodEnd ?? false,
            },
            subscriptions: user.subscriptions.map(subscription => ({
                ...subscription,
                currentPeriodStart: subscription.currentPeriodStart?.toISOString() ?? null,
                currentPeriodEnd: subscription.currentPeriodEnd?.toISOString() ?? null,
                createdAt: subscription.createdAt.toISOString(),
            })),
            limits: {
                alias: aliasLimits,
                drop: dropLimits,
            },
            usage: {
                storageUsed: Number(user.storageUsed),
                storageLimit: Number(user.storageLimit),
                aliasCount: aliases.length,
                domainCount: domains.length,
                dropCount: drops.length,
                formCount: forms.length,
            },
            aliases: aliases.map(alias => ({
                email: alias.email,
                localPart: alias.localPart,
                domain: alias.domain,
                active: alias.active,
                format: alias.format,
                recipient: alias.recipient?.email || null,
                createdAt: alias.createdAt.toISOString(),
                updatedAt: alias.updatedAt.toISOString(),
            })),
            domains: domains.map(domain => ({
                ...domain,
                createdAt: domain.createdAt.toISOString(),
                updatedAt: domain.updatedAt.toISOString(),
            })),
            drops: drops.map(drop => ({
                ...drop,
                totalSize: drop.files.reduce((sum, f) => sum + Number(f.size), 0),
                files: drop.files.map(f => ({
                    ...f,
                    size: Number(f.size),
                })),
                expiresAt: drop.expiresAt?.toISOString() || null,
                deletedAt: drop.deletedAt?.toISOString() || null,
                createdAt: drop.createdAt.toISOString(),
                updatedAt: drop.updatedAt.toISOString(),
            })),
            forms: forms.map(form => ({
                ...form,
                closesAt: form.closesAt?.toISOString() ?? null,
                deletedAt: form.deletedAt?.toISOString() ?? null,
                createdAt: form.createdAt.toISOString(),
                updatedAt: form.updatedAt.toISOString(),
            })),
            recipients: recipients.map(r => ({
                ...r,
                createdAt: r.createdAt.toISOString(),
            })),
            apiKeys: apiKeys.map(key => ({
                prefix: key.keyPrefix,
                label: key.label,
                createdAt: key.createdAt.toISOString(),
            })),
        }

        return new NextResponse(JSON.stringify(exportData, null, 2), {
            headers: {
                "Cache-Control": "private, no-store",
                "Content-Type": "application/json",
                "Content-Disposition": `attachment; filename="anon-li-export-${new Date().toISOString().split("T")[0]}.json"`,
            },
        })
    } catch (error) {
        logger.error("Error exporting user data", error)
        return NextResponse.json(
            { error: "Failed to export data" },
            { status: 500 }
        )
    }
}
