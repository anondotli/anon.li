import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { checkRateLimit, rateLimiters, getClientIp } from "@/lib/rate-limit"
import { requireSession } from "@/lib/api-auth"

export async function GET(req: NextRequest) {
    const session = await requireSession()
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    // Rate limit to prevent polling abuse
    const ip = await getClientIp()
    const rateLimited = await checkRateLimit(rateLimiters.api, `crypto-status:${ip}`)
    if (rateLimited) return rateLimited

    const orderId = req.nextUrl.searchParams.get("orderId")
    if (!orderId || typeof orderId !== "string") {
        return NextResponse.json({ error: "Missing orderId" }, { status: 400 })
    }

    const payment = await prisma.cryptoPayment.findUnique({
        where: { orderId },
        select: {
            status: true,
            product: true,
            tier: true,
            userId: true,
        },
    })

    if (!payment) {
        return NextResponse.json({ error: "Payment not found" }, { status: 404 })
    }

    // Ensure user owns this payment
    if (payment.userId !== session.userId) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 403 })
    }

    return NextResponse.json({
        status: payment.status,
        product: payment.product,
        tier: payment.tier,
    })
}
