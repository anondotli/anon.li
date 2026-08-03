import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimiters } from "@/lib/rate-limit"
import { requireSession } from "@/lib/api-auth"

const ORDER_ID_PATTERN = /^crypto_[A-Za-z0-9_-]{1,64}$/

export async function GET(req: NextRequest) {
    const session = await requireSession()
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit to prevent polling abuse
    const rateLimited = await checkRateLimit(rateLimiters.api, `crypto-status:${session.userId}`)
    if (rateLimited) return rateLimited

    const orderId = req.nextUrl.searchParams.get("orderId")
    if (!orderId || !ORDER_ID_PATTERN.test(orderId)) {
        return NextResponse.json({ error: "Invalid orderId" }, { status: 400 })
    }

    const payment = await prisma.cryptoPayment.findFirst({
        where: { orderId, userId: session.userId },
        select: {
            status: true,
            product: true,
            tier: true,
        },
    })

    if (!payment) {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 })
    }

    return NextResponse.json(
        {
            status: payment.status,
            product: payment.product,
            tier: payment.tier,
        },
        { headers: { "Cache-Control": "private, no-store" } },
    )
}
