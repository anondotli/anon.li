/**
 * POST /api/v1/checkout - Create a Stripe checkout session
 *
 * Authentication: API key only (Bearer ak_...)
 */

import { z } from "zod"

import { apiError, apiSuccess, ErrorCodes, zodErrorToDetails } from "@/lib/api-response"
import { getUserBillingState } from "@/lib/data/user"
import { withPolicy } from "@/lib/route-policy"
import { stripe } from "@/lib/stripe"
import { getStripePriceId } from "@/lib/stripe-prices"

export const dynamic = "force-dynamic"

const checkoutSchema = z.object({
    product: z.enum(["bundle", "alias", "drop"]),
    tier: z.enum(["plus", "pro"]),
    frequency: z.enum(["monthly", "yearly"]),
    promoCode: z.string().max(50).optional(),
})

export const POST = withPolicy(
    {
        auth: "api_key",
        requireCsrf: true,
        rateLimit: "stripeOps",
    },
    async (ctx) => {
        if (!ctx.userId) {
            return apiError("Unauthorized - API key required", ErrorCodes.UNAUTHORIZED, ctx.requestId, 401)
        }

        const body = await ctx.request.json().catch(() => null)
        const validation = checkoutSchema.safeParse(body)
        if (!validation.success) {
            return apiError(
                "Validation failed",
                ErrorCodes.VALIDATION_ERROR,
                ctx.requestId,
                400,
                zodErrorToDetails(validation.error),
            )
        }

        const { product, tier, frequency, promoCode } = validation.data
        const priceId = getStripePriceId(product, tier, frequency)
        if (!priceId) {
            return apiError("Invalid price configuration", ErrorCodes.INVALID_REQUEST, ctx.requestId, 400)
        }

        const user = await getUserBillingState(ctx.userId)
        if (!user?.email) {
            return apiError("User email not found", ErrorCodes.INTERNAL_ERROR, ctx.requestId, 500)
        }

        const sanitizedPromo = promoCode
            ? promoCode.replace(/[^a-zA-Z0-9_-]/g, "").toUpperCase()
            : undefined

        const baseConfig = {
            mode: "subscription" as const,
            payment_method_types: ["card" as const],
            ...(user.stripeCustomerId
                ? { customer: user.stripeCustomerId }
                : { customer_email: user.email }),
            client_reference_id: ctx.userId,
            line_items: [{ price: priceId, quantity: 1 }],
            success_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?success=true`,
            cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/billing?canceled=true`,
            metadata: { userId: ctx.userId },
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

                const matchedPromo = promotionCodes.data[0]
                checkoutConfig = matchedPromo
                    ? {
                        ...baseConfig,
                        discounts: [{ promotion_code: matchedPromo.id }],
                    }
                    : {
                        ...baseConfig,
                        allow_promotion_codes: true,
                    }
            } catch {
                checkoutConfig = { ...baseConfig, allow_promotion_codes: true }
            }
        } else {
            checkoutConfig = { ...baseConfig, allow_promotion_codes: true }
        }

        const checkoutSession = await stripe.checkout.sessions.create(checkoutConfig)
        if (!checkoutSession.url) {
            return apiError("Failed to create checkout session", ErrorCodes.INTERNAL_ERROR, ctx.requestId, 500)
        }

        return apiSuccess({ url: checkoutSession.url }, ctx.requestId)
    },
)
