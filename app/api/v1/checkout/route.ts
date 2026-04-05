/**
 * POST /api/v1/checkout - Create a Stripe checkout session
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { validateApiKey } from "@/lib/api-auth"
import { createRateLimitHeaders } from "@/lib/api-rate-limit"
import { getUserBillingState } from "@/lib/data/user"
import { stripe } from "@/lib/stripe"
import { rateLimit } from "@/lib/rate-limit"
import { getStripePriceId } from "@/lib/stripe-prices"
import { z } from "zod"
import {
    generateRequestId,
    apiSuccess,
    apiError,
    apiErrorFromUnknown,
    apiRateLimitError,
    withApiHeaders,
    ErrorCodes,
    zodErrorToDetails,
} from "@/lib/api-response"

export const dynamic = 'force-dynamic'

const checkoutSchema = z.object({
    product: z.enum(["bundle", "alias", "drop"]),
    tier: z.enum(["plus", "pro"]),
    frequency: z.enum(["monthly", "yearly"]),
    promoCode: z.string().max(50).optional(),
})

/**
 * POST /api/v1/checkout
 * Create a Stripe checkout session and return the URL
 */
export async function POST(req: Request) {
    const requestId = generateRequestId()

    const result = await validateApiKey(req)
    if (!result) {
        return apiError("Unauthorized - API key required", ErrorCodes.UNAUTHORIZED, requestId, 401)
    }

    if (!result.rateLimit.success) {
        return withApiHeaders(
            apiRateLimitError(requestId, result.rateLimit.reset, true),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    }

    // Stripe-specific rate limit (10/hour)
    const rateLimited = await rateLimit("stripeOps", result.user.id)
    if (rateLimited) {
        return rateLimited
    }

    try {
        const body = await req.json()
        const validation = checkoutSchema.safeParse(body)

        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                requestId,
                400,
                zodErrorToDetails(validation.error)
            )
        }

        const { product, tier, frequency, promoCode } = validation.data

        const priceId = getStripePriceId(product, tier, frequency)
        if (!priceId) {
            return apiError(
                "Invalid price configuration",
                ErrorCodes.INVALID_REQUEST,
                requestId,
                400
            )
        }

        // Get user email and stripe customer ID
        const user = await getUserBillingState(result.user.id)

        if (!user?.email) {
            return apiError("User email not found", ErrorCodes.INTERNAL_ERROR, requestId, 500)
        }

        // Sanitize promo code
        let sanitizedPromo: string | undefined
        if (promoCode) {
            sanitizedPromo = promoCode.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase()
        }

        // Build checkout session config
        const baseConfig = {
            mode: "subscription" as const,
            payment_method_types: ["card" as const],
            ...(user.stripeCustomerId
                ? { customer: user.stripeCustomerId }
                : { customer_email: user.email }),
            client_reference_id: result.user.id,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
            metadata: { userId: result.user.id },
        }

        let checkoutConfig: typeof baseConfig & {
            discounts?: { promotion_code: string }[]
            allow_promotion_codes?: boolean
        }

        if (sanitizedPromo) {
            try {
                const promotionCodes = await stripe.promotionCodes.list({
                    code: sanitizedPromo,
                    active: true,
                    limit: 1,
                })

                const matchedPromo = promotionCodes.data[0];
                if (matchedPromo) {
                    checkoutConfig = {
                        ...baseConfig,
                        discounts: [{ promotion_code: matchedPromo.id }],
                    }
                } else {
                    checkoutConfig = { ...baseConfig, allow_promotion_codes: true }
                }
            } catch {
                checkoutConfig = { ...baseConfig, allow_promotion_codes: true }
            }
        } else {
            checkoutConfig = { ...baseConfig, allow_promotion_codes: true }
        }

        const checkoutSession = await stripe.checkout.sessions.create(checkoutConfig)

        if (!checkoutSession.url) {
            return apiError(
                "Failed to create checkout session",
                ErrorCodes.INTERNAL_ERROR,
                requestId,
                500
            )
        }

        return withApiHeaders(
            apiSuccess({ url: checkoutSession.url }, requestId),
            requestId,
            createRateLimitHeaders(result.rateLimit)
        )
    } catch (error) {
        return apiErrorFromUnknown(error, requestId)
    }
}
