import {
    ALIAS_PLANS,
    BUNDLE_PLANS,
    DROP_PLANS,
    FORM_PLANS,
    PLAN_ENTITLEMENTS,
    type PlanDefinition,
    type Product,
} from "@/config/plans"

type PublicTier = "free" | "plus" | "pro"
type BillingInterval = "monthly" | "yearly"

interface ProductConfig {
    name: string
    description: string
    url: string
    plans: Record<PublicTier, PlanDefinition>
}

interface PublicAliasEntitlements {
    randomAliases: number | "unlimited"
    customAliases: number
    customDomains: number
    apiRequestsPerMonth: number
    recipients: number
    recipientsPerAlias: number
}

interface PublicDropEntitlements {
    maxFileSizeBytes: number
    maxFileSize: string
    bandwidthBytes: number
    bandwidth: string
    maxExpiryDays: number
    passwordProtection: boolean
    downloadLimits: boolean
    removeBranding: boolean
    downloadNotifications: boolean
    filePreview: boolean
    apiRequestsPerMonth: number
}

interface PublicFormEntitlements {
    forms: number | "unlimited"
    submissionsPerMonth: number | "unlimited"
    retentionDays: number
    passwordProtection: boolean
    removeBranding: boolean
    maxSubmissionFileSizeBytes: number
    maxSubmissionFileSize: string
    apiRequestsPerMonth: number
}

interface PublicEntitlements {
    alias?: PublicAliasEntitlements
    drop?: PublicDropEntitlements
    form?: PublicFormEntitlements
}

export interface PublicPriceOption {
    interval: BillingInterval
    price: number
    currency: "USD"
    billingDuration: "P1M" | "P1Y"
    equivalentMonthlyPrice?: number
}

export interface PublicFeatureGroup {
    name: string
    included: string[]
    unavailable: string[]
}

export interface PublicPricingPlan {
    id: string
    tier: PublicTier
    name: string
    description: string
    prices: {
        currency: "USD"
        monthly: number
        yearly: number
        yearlyEquivalentMonthly: number
        yearlySavings: number
        options: PublicPriceOption[]
    }
    features: string[]
    unavailableFeatures: string[]
    featureGroups: PublicFeatureGroup[]
    entitlements: PublicEntitlements
}

interface PublicPricingProduct {
    id: Product
    name: string
    description: string
    url: string
    plans: PublicPricingPlan[]
}

interface PublicPricingCatalog {
    name: string
    description: string
    url: string
    currency: "USD"
    billingNotes: string[]
    products: PublicPricingProduct[]
}

const SITE_URL = "https://anon.li"

const PRODUCT_ORDER = ["bundle", "alias", "drop", "form"] as const
const TIER_ORDER = ["free", "plus", "pro"] as const

const PRODUCTS: Record<Product, ProductConfig> = {
    bundle: {
        name: "Bundle",
        description: "Complete privacy suite with email aliases, encrypted file sharing, and forms.",
        url: `${SITE_URL}/pricing`,
        plans: BUNDLE_PLANS,
    },
    alias: {
        name: "Alias",
        description: "Anonymous email aliases to protect your inbox.",
        url: `${SITE_URL}/pricing?alias`,
        plans: ALIAS_PLANS,
    },
    drop: {
        name: "Drop",
        description: "End-to-end encrypted file sharing.",
        url: `${SITE_URL}/pricing?drop`,
        plans: DROP_PLANS,
    },
    form: {
        name: "Form",
        description: "End-to-end encrypted forms for confidential intake.",
        url: `${SITE_URL}/pricing?form`,
        plans: FORM_PLANS,
    },
}

function roundCurrency(value: number) {
    return Number(value.toFixed(2))
}

function formatBytes(bytes: number) {
    const gb = bytes / (1024 * 1024 * 1024)
    return gb >= 1 ? `${gb}GB` : `${Math.round(bytes / (1024 * 1024))}MB`
}

function getAliasEntitlements(tier: PublicTier): PublicAliasEntitlements {
    const entitlements = PLAN_ENTITLEMENTS.alias[tier]

    return {
        randomAliases: entitlements.random === -1 ? "unlimited" : entitlements.random,
        customAliases: entitlements.custom,
        customDomains: entitlements.domains,
        apiRequestsPerMonth: entitlements.apiRequests,
        recipients: entitlements.recipients,
        recipientsPerAlias: entitlements.recipientsPerAlias,
    }
}

function getDropEntitlements(tier: PublicTier): PublicDropEntitlements {
    const entitlements = PLAN_ENTITLEMENTS.drop[tier]

    return {
        maxFileSizeBytes: entitlements.maxFileSize,
        maxFileSize: formatBytes(entitlements.maxFileSize),
        bandwidthBytes: entitlements.bandwidth,
        bandwidth: formatBytes(entitlements.bandwidth),
        maxExpiryDays: entitlements.maxExpiryDays,
        passwordProtection: entitlements.customKey,
        downloadLimits: entitlements.downloadLimits,
        removeBranding: entitlements.noBranding,
        downloadNotifications: entitlements.downloadNotifications,
        filePreview: entitlements.filePreview,
        apiRequestsPerMonth: entitlements.apiRequests,
    }
}

function getFormEntitlements(tier: PublicTier): PublicFormEntitlements {
    const entitlements = PLAN_ENTITLEMENTS.form[tier]

    const forms = entitlements.forms as number
    const submissionsPerMonth = entitlements.submissionsPerMonth as number
    return {
        forms: forms === -1 ? "unlimited" : forms,
        submissionsPerMonth:
            submissionsPerMonth === -1 ? "unlimited" : submissionsPerMonth,
        retentionDays: entitlements.retentionDays,
        passwordProtection: entitlements.customKey,
        removeBranding: entitlements.removeBranding,
        maxSubmissionFileSizeBytes: entitlements.maxSubmissionFileSize,
        maxSubmissionFileSize: formatBytes(entitlements.maxSubmissionFileSize),
        apiRequestsPerMonth: entitlements.apiRequests,
    }
}

function getEntitlements(product: Product, tier: PublicTier): PublicEntitlements {
    if (product === "alias") {
        return { alias: getAliasEntitlements(tier) }
    }

    if (product === "drop") {
        return { drop: getDropEntitlements(tier) }
    }

    if (product === "form") {
        return { form: getFormEntitlements(tier) }
    }

    return {
        alias: getAliasEntitlements(tier),
        drop: getDropEntitlements(tier),
        form: getFormEntitlements(tier),
    }
}

function getFeatureGroups(plan: PlanDefinition): PublicFeatureGroup[] {
    if (plan.featureSections) {
        return plan.featureSections.map((section) => ({
            name: section.name,
            included: section.features,
            unavailable: section.missingFeatures ?? [],
        }))
    }

    return [
        {
            name: "Included",
            included: plan.features,
            unavailable: plan.missingFeatures,
        },
    ]
}

function getPriceOptions(plan: PlanDefinition): PublicPriceOption[] {
    if (plan.price.monthly === 0 && plan.price.yearly === 0) {
        return [
            {
                interval: "monthly",
                price: 0,
                currency: "USD",
                billingDuration: "P1M",
            },
        ]
    }

    return [
        {
            interval: "monthly",
            price: plan.price.monthly,
            currency: "USD",
            billingDuration: "P1M",
        },
        {
            interval: "yearly",
            price: plan.price.yearly,
            currency: "USD",
            billingDuration: "P1Y",
            equivalentMonthlyPrice: roundCurrency(plan.price.yearly / 12),
        },
    ]
}

function serializePlan(product: Product, tier: PublicTier, plan: PlanDefinition): PublicPricingPlan {
    const yearlyEquivalentMonthly = roundCurrency(plan.price.yearly / 12)

    return {
        id: `${product}_${tier}`,
        tier,
        name: plan.name,
        description: plan.description,
        prices: {
            currency: "USD",
            monthly: plan.price.monthly,
            yearly: plan.price.yearly,
            yearlyEquivalentMonthly,
            yearlySavings: roundCurrency((plan.price.monthly * 12) - plan.price.yearly),
            options: getPriceOptions(plan),
        },
        features: plan.features,
        unavailableFeatures: plan.missingFeatures,
        featureGroups: getFeatureGroups(plan),
        entitlements: getEntitlements(product, tier),
    }
}

export function getPublicPricingCatalog(): PublicPricingCatalog {
    return {
        name: "anon.li Pricing",
        description: "Public pricing for anon.li Bundle, Alias, Drop, and Form plans.",
        url: `${SITE_URL}/pricing`,
        currency: "USD",
        billingNotes: [
            "Free plans are available without a paid subscription.",
            "Monthly prices are charged once per month.",
            "Yearly prices are charged once per year. The equivalent monthly price is rounded for display.",
        ],
        products: PRODUCT_ORDER.map((product) => {
            const config = PRODUCTS[product]

            return {
                id: product,
                name: config.name,
                description: config.description,
                url: config.url,
                plans: TIER_ORDER.map((tier) => serializePlan(product, tier, config.plans[tier])),
            }
        }),
    }
}

function serviceProperties(plan: PublicPricingPlan) {
    const properties = [
        {
            "@type": "PropertyValue",
            name: "Plan ID",
            value: plan.id,
        },
        {
            "@type": "PropertyValue",
            name: "Included features",
            value: plan.features.join("; "),
        },
    ]

    if (plan.unavailableFeatures.length > 0) {
        properties.push({
            "@type": "PropertyValue",
            name: "Unavailable features",
            value: plan.unavailableFeatures.join("; "),
        })
    }

    return properties
}

function pricingOffer(
    product: PublicPricingProduct,
    plan: PublicPricingPlan,
    option: PublicPriceOption
) {
    const intervalLabel = option.interval === "monthly" ? "monthly" : "yearly"

    return {
        "@type": "Offer",
        "@id": `${product.url}#${plan.id}-${option.interval}`,
        name: `${product.name} ${plan.name} ${intervalLabel} plan`,
        url: product.url,
        price: option.price,
        priceCurrency: option.currency,
        availability: "https://schema.org/InStock",
        priceSpecification: {
            "@type": "UnitPriceSpecification",
            price: option.price,
            priceCurrency: option.currency,
            billingDuration: option.billingDuration,
        },
        itemOffered: {
            "@type": "Service",
            "@id": `${product.url}#${plan.id}`,
            name: `${product.name} ${plan.name}`,
            description: plan.description,
            serviceType: product.name,
            provider: {
                "@type": "Organization",
                name: "anon.li",
                url: SITE_URL,
            },
            additionalProperty: serviceProperties(plan),
        },
    }
}

export function getPricingJsonLd() {
    const catalog = getPublicPricingCatalog()
    const offers = catalog.products.flatMap((product) =>
        product.plans.flatMap((plan) =>
            plan.prices.options.map((option) => pricingOffer(product, plan, option))
        )
    )

    return {
        "@context": "https://schema.org",
        "@graph": [
            {
                "@type": "WebPage",
                "@id": `${catalog.url}#webpage`,
                url: catalog.url,
                name: catalog.name,
                description: catalog.description,
                mainEntity: {
                    "@id": `${catalog.url}#pricing-catalog`,
                },
            },
            {
                "@type": "OfferCatalog",
                "@id": `${catalog.url}#pricing-catalog`,
                name: catalog.name,
                url: catalog.url,
                itemListElement: offers.map((offer, index) => ({
                    "@type": "ListItem",
                    position: index + 1,
                    item: offer,
                })),
            },
        ],
    }
}
