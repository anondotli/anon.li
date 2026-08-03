import "server-only"

import { BUNDLE_PLANS, ALIAS_PLANS, DROP_PLANS, FORM_PLANS } from "@/config/plans"

const VALID_PRODUCTS = ["bundle", "alias", "drop", "form"] as const
const VALID_TIERS = ["plus", "pro"] as const
const VALID_INTERVALS = ["monthly", "yearly"] as const

export type CryptoProduct = (typeof VALID_PRODUCTS)[number]
export type CryptoTier = (typeof VALID_TIERS)[number]
export type CryptoInterval = (typeof VALID_INTERVALS)[number]

export function isValidCryptoProduct(value: unknown): value is CryptoProduct {
    return typeof value === "string" && VALID_PRODUCTS.includes(value as CryptoProduct)
}

export function isValidCryptoTier(value: unknown): value is CryptoTier {
    return typeof value === "string" && VALID_TIERS.includes(value as CryptoTier)
}

export function isValidCryptoInterval(value: unknown): value is CryptoInterval {
    return typeof value === "string" && VALID_INTERVALS.includes(value as CryptoInterval)
}

interface CryptoPrice {
    usdAmount: number
    stripePriceId: string
    label: string
    interval: CryptoInterval
}

/**
 * Get the crypto price for a given product, tier, and billing interval.
 * Defaults to yearly (the historic and still-default billing interval).
 */
export function getCryptoPrice(
    product: CryptoProduct,
    tier: CryptoTier,
    interval: CryptoInterval = "yearly",
): CryptoPrice | null {
    const plans =
        product === "bundle" ? BUNDLE_PLANS :
        product === "alias" ? ALIAS_PLANS :
        product === "form" ? FORM_PLANS :
        DROP_PLANS

    const plan = plans[tier]
    const priceId = interval === "monthly" ? plan?.priceIds?.monthly : plan?.priceIds?.yearly
    if (!plan || !priceId) return null

    const usdAmount = interval === "monthly" ? plan.price.monthly : plan.price.yearly
    const intervalLabel = interval === "monthly" ? "Monthly" : "Yearly"

    return {
        usdAmount,
        stripePriceId: priceId,
        label: `${product.charAt(0).toUpperCase() + product.slice(1)} ${plan.name} (${intervalLabel})`,
        interval,
    }
}

/**
 * Resolve the billing interval encoded in a Stripe price id used for a crypto
 * purchase. Crypto payments are one-off NOWPayments invoices, so the interval
 * purchased at checkout is only recoverable from the price id stored on the
 * CryptoPayment row (`planPriceId`). Returns null for price ids that don't
 * belong to a crypto-eligible plan (e.g. env misconfiguration or Business
 * seat prices, which are never sold via crypto).
 */
export function getCryptoIntervalForStripePriceId(priceId: string): CryptoInterval | null {
    for (const plans of [BUNDLE_PLANS, ALIAS_PLANS, DROP_PLANS, FORM_PLANS]) {
        for (const tier of VALID_TIERS) {
            const ids = plans[tier]?.priceIds
            if (!ids) continue
            if (ids.monthly === priceId) return "monthly"
            if (ids.yearly === priceId) return "yearly"
        }
    }
    return null
}
