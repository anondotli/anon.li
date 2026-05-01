/**
 * Server-side Stripe Price ID Configuration
 *
 * This file is SERVER-ONLY and should never be imported by client components.
 * It provides a safe way to look up Stripe price IDs from plan identifiers.
 */

import "server-only"
import { createLogger } from "@/lib/logger"

const logger = createLogger("StripePrices")

// Valid values for type safety and validation
const VALID_PRODUCTS = ["bundle", "alias", "drop", "form"] as const
const VALID_TIERS = ["plus", "pro"] as const
const VALID_FREQUENCIES = ["monthly", "yearly"] as const

export type Product = typeof VALID_PRODUCTS[number]
export type Tier = typeof VALID_TIERS[number]
export type BillingFrequency = typeof VALID_FREQUENCIES[number]

interface PriceIdConfig {
    monthly: string | undefined
    yearly: string | undefined
}

/**
 * Validate that a product value is valid.
 */
export function isValidProduct(value: unknown): value is Product {
    return typeof value === "string" && VALID_PRODUCTS.includes(value as Product)
}

/**
 * Validate that a tier value is valid.
 */
export function isValidTier(value: unknown): value is Tier {
    return typeof value === "string" && VALID_TIERS.includes(value as Tier)
}

/**
 * Validate that a billing frequency value is valid.
 */
export function isValidFrequency(value: unknown): value is BillingFrequency {
    return typeof value === "string" && VALID_FREQUENCIES.includes(value as BillingFrequency)
}

/**
 * Get the Stripe price ID for a given product, tier, and billing frequency.
 * This function reads environment variables at runtime, ensuring they're available
 * on the server even if they weren't at build time.
 *
 * @param product - The product type (bundle, alias, drop)
 * @param tier - The subscription tier (plus, pro)
 * @param frequency - Billing frequency (monthly, yearly)
 * @returns The Stripe price ID or null if not configured/invalid
 */
export function getStripePriceId(
    product: Product,
    tier: Tier,
    frequency: BillingFrequency
): string | null {
    // Runtime validation to prevent injection attacks
    if (!isValidProduct(product) || !isValidTier(tier) || !isValidFrequency(frequency)) {
        logger.error("Invalid parameters", undefined, { product, tier, frequency })
        return null
    }
    
    const priceIds = getPriceIdsForPlan(product, tier)
    if (!priceIds) return null
    
    const priceId = frequency === "yearly" ? priceIds.yearly : priceIds.monthly
    
    if (priceId && !priceId.startsWith("price_")) {
        logger.error("Invalid price ID format", undefined, { priceId })
        return null
    }
    
    return priceId || null
}

/**
 * Get all price IDs for a product/tier combination.
 * Reads from environment variables at runtime.
 */
function getPriceIdsForPlan(product: Product, tier: Tier): PriceIdConfig | null {
    // Construct env var name safely - values already validated above
    const envPrefix = `STRIPE_${product.toUpperCase()}_${tier.toUpperCase()}`
    
    return {
        monthly: process.env[`${envPrefix}_MONTHLY_PRICE_ID`],
        yearly: process.env[`${envPrefix}_YEARLY_PRICE_ID`],
    }
}