import { NextResponse } from "next/server"
import { auth } from "@/auth"
import { getUserBillingState } from "@/lib/data/user"
import { rateLimit } from "@/lib/rate-limit"
import { readApiRateLimit, readDropApiRateLimit } from "@/lib/api-rate-limit"
import { createLogger } from "@/lib/logger"

const logger = createLogger("UserUsageAPI")

function formatQuota(result: { limit: number; remaining: number; reset: Date }) {
    if (result.limit === -1) {
        return { used: 0, limit: -1, remaining: -1, resetAt: null, unlimited: true }
    }
    const used = result.limit - result.remaining
    return {
        used,
        limit: result.limit,
        remaining: result.remaining,
        resetAt: result.reset.toISOString(),
        unlimited: false,
    }
}

/**
 * GET /api/user/usage
 * Returns the user's current API usage stats for both Alias and Drop
 */
export async function GET() {
    try {
        const session = await auth()
        if (!session?.user?.id) {
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
        }

        // Rate limit check - use dropList limiter (60/min) for frequent but bounded queries
        const rateLimited = await rateLimit("dropList", session.user.id)
        if (rateLimited) return rateLimited

        const user = await getUserBillingState(session.user.id)

        if (!user) {
            return NextResponse.json({ error: "User not found" }, { status: 404 })
        }

        const [aliasResult, dropResult] = await Promise.all([
            readApiRateLimit(session.user.id, user),
            readDropApiRateLimit(session.user.id, user),
        ])

        return NextResponse.json({
            alias: formatQuota(aliasResult),
            drop: formatQuota(dropResult),
        })
    } catch (error) {
        logger.error("Error fetching API usage", error)
        return NextResponse.json(
            { error: "Failed to fetch usage" },
            { status: 500 }
        )
    }
}
