import Stripe from "stripe"

// Validate required Stripe environment variables at startup
if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is required for billing functionality")
}

if (!process.env.STRIPE_WEBHOOK_SECRET) {
    throw new Error("STRIPE_WEBHOOK_SECRET is required for billing functionality")
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
    typescript: true,
    timeout: 15_000, // 15s timeout for Stripe API calls
})
