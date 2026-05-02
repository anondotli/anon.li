import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getDisplayPlanLimits, getDropLimits, getEffectiveTier } from "@/lib/limits"
import { rateLimit } from "@/lib/rate-limit"
import { createLogger } from "@/lib/logger"
import { requireSession } from "@/lib/api-auth"

const logger = createLogger("UserExportAPI")

/**
 * GET /api/user/export
 * Generates a comprehensive data export for the authenticated user
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
                subscriptions: {
                    where: { status: { in: ["active", "trialing"] } },
                    select: {
                        provider: true,
                        product: true,
                        tier: true,
                        status: true,
                        currentPeriodStart: true,
                        currentPeriodEnd: true,
                        cancelAtPeriodEnd: true,
                    },
                },
            }
        })

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        // Fetch related data separately
        const aliases = await prisma.alias.findMany({
            where: { userId: userId },
            select: {
                email: true,
                localPart: true,
                domain: true,
                active: true,
                format: true,
                recipient: {
                    select: {
                        email: true,
                    }
                },
                createdAt: true,
                updatedAt: true,
            }
        }) as unknown as Array<{ email: string; localPart: string; domain: string; active: boolean; format: string; recipient: { email: string } | null; createdAt: Date; updatedAt: Date }>

        const domains = await prisma.domain.findMany({
            where: { userId: userId },
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
            }
        }) as unknown as Array<{ domain: string; verified: boolean; ownershipVerified: boolean; mxVerified: boolean; spfVerified: boolean; dkimVerified: boolean; dkimSelector: string | null; createdAt: Date; updatedAt: Date }>

        const drops = await prisma.drop.findMany({
            where: { userId: userId },
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
                    }
                }
            }
        }) as unknown as Array<{ id: string; encryptedTitle: string | null; encryptedMessage: string | null; downloads: number; maxDownloads: number | null; expiresAt: Date | null; customKey: boolean; hideBranding: boolean; deletedAt: Date | null; createdAt: Date; updatedAt: Date; files: Array<{ id: string; encryptedName: string | null; size: bigint | null; mimeType: string | null }> }>

        const recipients = await prisma.recipient.findMany({
            where: { userId: userId },
            select: {
                email: true,
                verified: true,
                isDefault: true,
                pgpFingerprint: true,
                pgpKeyName: true,
                createdAt: true,
            }
        }) as unknown as Array<{ email: string; verified: boolean; isDefault: boolean; pgpFingerprint: string | null; pgpKeyName: string | null; createdAt: Date }>

        const apiKeys = await prisma.apiKey.findMany({
            where: { userId: userId },
            select: {
                keyPrefix: true,
                label: true,
                createdAt: true,
            }
        }) as unknown as Array<{ keyPrefix: string; label: string | null; createdAt: Date }>

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
