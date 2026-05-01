import "server-only"

import { BUNDLE_PLANS, ALIAS_PLANS, DROP_PLANS, FORM_PLANS } from "@/config/plans"

const VALID_PRODUCTS = ["bundle", "alias", "drop", "form"] as const
const VALID_TIERS = ["plus", "pro"] as const

export type CryptoProduct = (typeof VALID_PRODUCTS)[number]
export type CryptoTier = (typeof VALID_TIERS)[number]

export function isValidCryptoProduct(value: unknown): value is CryptoProduct {
    return typeof value === "string" && VALID_PRODUCTS.includes(value as CryptoProduct)
}

export function isValidCryptoTier(value: unknown): value is CryptoTier {
    return typeof value === "string" && VALID_TIERS.includes(value as CryptoTier)
}

interface CryptoPrice {
    usdAmount: number
    stripePriceId: string
    label: string
}

/**
 * Get the crypto price for a given product and tier.
 * Only yearly billing is supported for crypto payments.
 */
export function getCryptoPrice(product: CryptoProduct, tier: CryptoTier): CryptoPrice | null {
    const plans =
        product === "bundle" ? BUNDLE_PLANS :
        product === "alias" ? ALIAS_PLANS :
        product === "form" ? FORM_PLANS :
        DROP_PLANS

    const plan = plans[tier]
    if (!plan || !plan.priceIds?.yearly) return null

    return {
        usdAmount: plan.price.yearly,
        stripePriceId: plan.priceIds.yearly,
        label: `${product.charAt(0).toUpperCase() + product.slice(1)} ${plan.name} (Yearly)`,
    }
}
