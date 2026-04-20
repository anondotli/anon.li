import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import { z } from "zod"
import { Resend } from "resend"
import { render } from "@react-email/render"
import { DropTakedownEmail } from "@/components/email/drop-takedown"
import { AccountBannedEmail } from "@/components/email/account-banned"
import { isInternalRateLimited, validateInternalApiSecret } from "@/lib/internal-api-auth"
import { createLogger } from "@/lib/logger"

const logger = createLogger("FileTakedownAPI")

// Lazy initialization to avoid build-time errors
function getResendClient() {
    return new Resend(process.env.AUTH_RESEND_KEY)
}

// This endpoint is used by admins to take down drops that violate policies
// It requires a valid Bearer token matching env.MAIL_API_SECRET
// Usage: curl -X POST /api/internal/drop-takedown -H "Authorization: Bearer $TOKEN" -d '{"dropId": "xxx", "reason": "xxx"}'
export const dynamic = 'force-dynamic'

const MAX_STRIKES = 3

const takedownSchema = z.object({
    dropId: z.string().min(1).max(100),
    reason: z.string().min(1).max(2000),
})

export async function POST(req: Request) {
    if (!validateInternalApiSecret(req)) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    if (await isInternalRateLimited("file-takedown")) {
        return NextResponse.json({ error: "Too many requests" }, { status: 429 })
    }

    try {
        const body = await req.json()
        const parsed = takedownSchema.safeParse(body)

        if (!parsed.success) {
            return NextResponse.json(
                { error: "Invalid input", details: parsed.error.flatten() },
                { status: 400 }
            )
        }

        const { dropId, reason } = parsed.data

        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: { user: { select: { id: true, email: true, name: true, tosViolations: true, banned: true } } }
        })

        if (!drop) return NextResponse.json({ error: "Drop not found" }, { status: 404 })
        if (drop.takenDown) return NextResponse.json({ error: "Drop already taken down" }, { status: 400 })

        await markDropAsTakenDown(dropId, reason)

        let strikeResult = { newStrikeCount: 0, userBanned: false, banReason: "" }
        if (drop.user && !drop.user.banned) {
            strikeResult = await handleUserStrikes(drop.user, reason)
            if (drop.user.email) {
                await sendTakedownEmails(drop.user.email, drop.id, reason, strikeResult)
            }
        }

        return NextResponse.json({
            success: true,
            dropId,
            takenDownAt: new Date().toISOString(),
            ownerNotified: !!drop.user?.email,
            strikeCount: strikeResult.newStrikeCount,
            userBanned: strikeResult.userBanned,
            message: strikeResult.userBanned
                ? `Drop taken down. User has been permanently banned (${strikeResult.newStrikeCount}/${MAX_STRIKES} strikes).`
                : drop.user
                    ? `Drop taken down. User has ${strikeResult.newStrikeCount}/${MAX_STRIKES} strikes.`
                    : "Drop taken down. No registered owner."
        })

    } catch (error) {
        logger.error("Drop takedown error", error)
        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 })
    }
}

async function markDropAsTakenDown(dropId: string, reason: string) {
    await prisma.drop.update({
        where: { id: dropId },
        data: {
            takenDown: true,
            takedownReason: reason,
            takenDownAt: new Date(),
            disabled: true,
            disabledAt: new Date(),
        }
    })
}

async function handleUserStrikes(user: { id: string, tosViolations: number }, reason: string) {
    const banReason = `Account banned after ${MAX_STRIKES} Terms of Service violations. Final violation: ${reason}`

    // Atomic increment + conditional ban using raw SQL to prevent race conditions
    const result = await prisma.$queryRaw<{ tosViolations: number; banned: boolean }[]>`
        UPDATE "users"
        SET "tosViolations" = "tosViolations" + 1,
            "banned" = CASE WHEN "tosViolations" + 1 >= ${MAX_STRIKES} THEN true ELSE "banned" END,
            "banReason" = CASE WHEN "tosViolations" + 1 >= ${MAX_STRIKES} AND "banned" = false
                THEN ${banReason}
                ELSE "banReason" END
        WHERE "id" = ${user.id}
        RETURNING "tosViolations", "banned"
    `

    const updated = result[0]
    if (!updated) {
        return { newStrikeCount: user.tosViolations + 1, userBanned: false, banReason }
    }

    return { newStrikeCount: updated.tosViolations, userBanned: updated.banned, banReason }
}

async function sendTakedownEmails(
    email: string,
    dropId: string,
    reason: string,
    { newStrikeCount, userBanned }: { newStrikeCount: number, userBanned: boolean }
) {
    try {
        const emailHtml = await render(
            DropTakedownEmail({
                fileId: dropId,
                reason,
                strikeCount: newStrikeCount,
                isBanned: userBanned,
            })
        )

        await getResendClient().emails.send({
            from: "anon.li <hi@anon.li>",
            to: email,
            subject: userBanned
                ? `Account Suspended - Policy Violation (Strike ${newStrikeCount}/${MAX_STRIKES})`
                : `Drop Removed - Policy Violation (Strike ${newStrikeCount}/${MAX_STRIKES})`,
            html: emailHtml,
        })

        if (userBanned) {
            const banEmailHtml = await render(AccountBannedEmail({ reason }))
            await getResendClient().emails.send({
                from: "anon.li <hi@anon.li>",
                to: email,
                subject: "Your anon.li Account Has Been Permanently Suspended",
                html: banEmailHtml,
            })
        }
    } catch (emailError) {
        logger.error("Failed to send takedown/ban email", emailError)
    }
}
