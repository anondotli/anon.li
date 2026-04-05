import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { validateInternalApiSecret, isInternalRateLimited } from "@/lib/internal-api-auth"
import { z } from "zod"
import { createLogger } from "@/lib/logger"
import { getPlanLimitsAsync } from "@/lib/limits"

const logger = createLogger("MailAliasAPI")

// Email validation schema
const emailSchema = z.string().email().max(254);

// This endpoint is used by the mail server to verify aliases
// Supports both GET (query param) and POST (JSON body) for compatibility
export const dynamic = 'force-dynamic'

// Shared alias lookup logic
async function lookupAlias(email: string) {
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
        return { error: "Invalid email format", status: 400 }
    }
    const validatedEmail = emailResult.data;

    try {
        const alias = await prisma.alias.findFirst({
            where: {
                email: validatedEmail.toLowerCase(),
                active: true,
            },
            include: {
                aliasRecipients: {
                    include: { recipient: true },
                    orderBy: { ordinal: "asc" as const },
                },
                recipient: {
                    select: {
                        email: true,
                        pgpPublicKey: true,
                    }
                },
                user: {
                    select: {
                        stripeSubscriptionId: true,
                    }
                }
            }
        })

        if (!alias) {
            // Check for catch-all domain
            const atIndex = validatedEmail.indexOf("@")
            const localPart = validatedEmail.substring(0, atIndex)
            const domain = validatedEmail.substring(atIndex + 1)
            if (localPart && domain) {
                const catchAllDomain = await prisma.domain.findFirst({
                    where: {
                        domain,
                        verified: true,
                        catchAll: true,
                        userId: { not: null },
                    },
                    select: {
                        userId: true,
                        catchAllRecipientId: true,
                        domain: true,
                    },
                })

                if (catchAllDomain?.userId && catchAllDomain.catchAllRecipientId) {
                    // Enforce alias count limit before auto-creating
                    const limits = await getPlanLimitsAsync(catchAllDomain.userId)
                    const currentCount = await prisma.alias.count({
                        where: { userId: catchAllDomain.userId },
                    })

                    if (limits.random !== -1 && currentCount >= limits.random + limits.custom) {
                        logger.warn("Catch-all alias creation blocked: user at alias limit", {
                            userId: catchAllDomain.userId, domain, currentCount,
                            limit: limits.random + limits.custom,
                        })
                        return { error: "Alias not found", status: 404 }
                    }

                    // Auto-create alias for catch-all (with join table row)
                    const newAlias = await prisma.$transaction(async (tx) => {
                        const created = await tx.alias.create({
                            data: {
                                email: validatedEmail,
                                localPart,
                                domain,
                                userId: catchAllDomain.userId!,
                                recipientId: catchAllDomain.catchAllRecipientId,
                                format: "RANDOM",
                                active: true,
                            },
                            include: {
                                recipient: {
                                    select: { email: true, pgpPublicKey: true },
                                },
                            },
                        })

                        // Create join table row
                        await tx.aliasRecipient.create({
                            data: {
                                aliasId: created.id,
                                recipientId: catchAllDomain.catchAllRecipientId!,
                                ordinal: 0,
                                isPrimary: true,
                            },
                        })

                        return created
                    })

                    if (newAlias.recipient) {
                        logger.info("Catch-all alias created", { email: validatedEmail, domain })
                        return {
                            data: {
                                id: newAlias.id,
                                email: newAlias.email,
                                active: true,
                                isActive: true,
                                localPart,
                                domain,
                                userId: catchAllDomain.userId,
                                recipients: [{
                                    email: newAlias.recipient.email,
                                    pgpPublicKey: newAlias.recipient.pgpPublicKey || null,
                                }],
                            },
                        }
                    }
                }
            }

            return { error: "Alias not found", status: 404 }
        }

        // Resolve recipients: prefer join table, fall back to legacy
        const recipients = alias.aliasRecipients && alias.aliasRecipients.length > 0
            ? alias.aliasRecipients.map((ar: { recipient: { email: string; pgpPublicKey: string | null } }) => ({
                email: ar.recipient.email,
                pgpPublicKey: ar.recipient.pgpPublicKey || null,
            }))
            : alias.recipient
                ? [{ email: alias.recipient.email, pgpPublicKey: alias.recipient.pgpPublicKey || null }]
                : []

        if (recipients.length === 0) {
            return { error: "Alias has no recipient configured", status: 404 }
        }

        return {
            data: {
                id: alias.id,
                email: alias.email,
                active: true,
                isActive: true,
                localPart: alias.localPart,
                domain: alias.domain,
                userId: alias.userId,
                recipients,
            }
        }
    } catch (error) {
        logger.error("Mail API Error", error)
        return { error: "Internal Server Error", status: 500 }
    }
}

export async function GET(req: Request) {
    if (!validateInternalApiSecret(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (await isInternalRateLimited("aliases")) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    const { searchParams } = new URL(req.url)
    const queryEmail = searchParams.get('email')

    if (!queryEmail) {
        return NextResponse.json({ error: "Email query parameter required" }, { status: 400 })
    }

    const result = await lookupAlias(queryEmail)

    if (result.error) {
        return NextResponse.json({ error: result.error }, { status: result.status })
    }

    return NextResponse.json({ alias: result.data })
}

// POST handler for mail server compatibility
// Expects JSON body: { email: "alias@example.com" }
export async function POST(req: Request) {
    if (!validateInternalApiSecret(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (await isInternalRateLimited("aliases")) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    let body: { email?: string }
    try {
        body = await req.json()
    } catch {
        return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 })
    }

    if (!body.email) {
        return NextResponse.json({ error: "Email field required in body" }, { status: 400 })
    }

    const result = await lookupAlias(body.email)

    if (result.error) {
        return NextResponse.json({ error: result.error, active: false }, { status: result.status })
    }

    // Return format expected by mail server
    return NextResponse.json({ ...result.data, active: true })
}

// Stats schema for PATCH handler
const statsSchema = z.object({
    aliasId: z.string(),
    forwarded: z.number().optional(),
    blocked: z.number().optional(),
    bytesForwarded: z.number().optional(),
})

/**
 * PATCH /api/internal/aliases
 * Update alias statistics (merged from /stats route)
 */
export async function PATCH(req: Request) {
    if (!validateInternalApiSecret(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (await isInternalRateLimited("aliases")) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    try {
        const body = await req.json()

        const validation = statsSchema.safeParse(body)
        if (validation.success) {
            const { aliasId, forwarded, blocked } = validation.data

            const updateData: Record<string, unknown> = {}

            if (forwarded && forwarded > 0) {
                updateData.emailsReceived = { increment: forwarded }
                updateData.lastEmailAt = new Date()
            }

            if (blocked && blocked > 0) {
                updateData.emailsBlocked = { increment: blocked }
            }

            if (Object.keys(updateData).length > 0) {
                await prisma.alias.update({
                    where: { id: aliasId },
                    data: updateData,
                })
            }

            return NextResponse.json({ success: true })
        }

        return NextResponse.json({ error: "Invalid request format" }, { status: 400 })
    } catch (error) {
        // Alias not found is not an error for stats - email might be for custom domain
        if (error instanceof Error && error.message.includes("Record to update not found")) {
            return NextResponse.json({ success: true, skipped: true })
        }

        logger.error("Alias stats error", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}
