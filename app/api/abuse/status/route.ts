import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function GET(req: Request) {
    const { searchParams } = new URL(req.url)
    const token = searchParams.get("token")

    if (!token || token.length !== 32 || !/^[0-9a-f]+$/.test(token)) {
        return NextResponse.json(
            { error: "Invalid tracking token" },
            { status: 400 }
        )
    }

    const report = await prisma.abuseReport.findUnique({
        where: { trackingToken: token },
        select: {
            status: true,
            createdAt: true,
        },
    })

    if (!report) {
        return NextResponse.json(
            { error: "Report not found" },
            { status: 404 }
        )
    }

    return NextResponse.json({
        status: report.status,
        createdAt: report.createdAt,
    })
}
