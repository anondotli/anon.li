import { NextResponse } from "next/server"
import { syncSubscriptionFromStripe } from "@/lib/services/subscription-sync"
import { rateLimit } from "@/lib/rate-limit"
import { validateCsrf } from "@/lib/csrf"
import { requireSession } from "@/lib/api-auth"
export const dynamic = "force-dynamic"

/**
 * POST /api/billing/sync
 *
 * On-demand subscription sync from Stripe.
 * Use this when:
 * - User reports their subscription state looks stale
 * - The canonical Subscription row has a past period end but the user believes they're subscribed
 * - After a failed webhook that was manually resolved in Stripe
 */
export async function POST(req: Request) {
    const session = await requireSession()

    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }

    validateCsrf(req)

    // Rate limit - this calls Stripe API which is expensive
    const rateLimited = await rateLimit("stripeOps", session.userId)
    if (rateLimited) return rateLimited

    const result = await syncSubscriptionFromStripe(session.userId)

    if (!result.synced) {
        return NextResponse.json(
            { error: result.error || "Failed to sync subscription" },
            { status: 500 }
        )
    }

    return NextResponse.json({ success: true, synced: true })
}
