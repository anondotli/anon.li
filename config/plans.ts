/**
 * Plans Configuration for anon.li
 *
 * PLAN_ENTITLEMENTS is the single source of truth for all limits, features,
 * and tier definitions. Marketing pages, pricing UI, docs, and runtime
 * enforcement all derive from this structure.
 *
 * Pricing Philosophy:
 * - Alias: High margin (88-94%) - storage costs are minimal
 * - Drop: Conservative (43-65%) - bandwidth costs are significant
 * - Bundle: Best value for users who need both
 */

export type Product = "bundle" | "alias" | "drop" | "form";
export type PaidTier = "plus" | "pro";
export type Tier = "guest" | "free" | PaidTier;

// ─── Size helpers ──────────────────────────────────────────────────────────

const GB = 1024 * 1024 * 1024;

// ─── Canonical entitlement definitions ─────────────────────────────────────

export interface AliasEntitlements {
    random: number;
    custom: number;
    domains: number;
    apiRequests: number;
    recipients: number;
    /** Max recipients per alias (multi-recipient routing) */
    recipientsPerAlias: number;
}

interface DropEntitlements {
    maxFileSize: number;   // bytes
    bandwidth: number;     // bytes
    maxExpiryDays: number;
    customKey: boolean;
    downloadLimits: boolean;
    noBranding: boolean;
    downloadNotifications: boolean;
    filePreview: boolean;
    apiRequests: number;
}

export interface FormEntitlements {
    /** Max active (non-deleted) forms the user may own. -1 = unlimited */
    forms: number;
    /** Max submissions accepted per calendar month. -1 = unlimited */
    submissionsPerMonth: number;
    /** Submissions are purged after this many days */
    retentionDays: number;
    /** Strip anon.li branding from the public form page */
    removeBranding: boolean;
    /** Allow password-protecting a form */
    customKey: boolean;
    /** Per-upload byte cap for submission attachments (0 = no uploads) */
    maxSubmissionFileSize: number;
    apiRequests: number;
}

/**
 * Single source of truth for all plan entitlements.
 * Every limit, feature flag, and tier definition lives here.
 */
export const PLAN_ENTITLEMENTS = {
    alias: {
        free: {
            random: 10,
            custom: 1,
            domains: 0,
            apiRequests: 500,
            recipients: 1,
            recipientsPerAlias: 1,
        },
        plus: {
            random: 100,
            custom: 10,
            domains: 3,
            apiRequests: 25_000,
            recipients: 5,
            recipientsPerAlias: 3,
        },
        pro: {
            random: -1,
            custom: 100,
            domains: 10,
            apiRequests: 100_000,
            recipients: 10,
            recipientsPerAlias: 5,
        },
    },
    drop: {
        guest: {
            maxFileSize: 100 * 1024 * 1024,
            bandwidth: 0,
            maxExpiryDays: 3,
            customKey: false,
            downloadLimits: true,
            noBranding: false,
            downloadNotifications: false,
            filePreview: true,
            apiRequests: 0,
        },
        free: {
            maxFileSize: 5 * GB,
            bandwidth: 5 * GB,
            maxExpiryDays: 3,
            customKey: false,
            downloadLimits: true,
            noBranding: false,
            downloadNotifications: false,
            filePreview: true,
            apiRequests: 500,
        },
        plus: {
            maxFileSize: 50 * GB,
            bandwidth: 50 * GB,
            maxExpiryDays: 7,
            customKey: true,
            downloadLimits: true,
            noBranding: false,
            downloadNotifications: false,
            filePreview: true,
            apiRequests: 25_000,
        },
        pro: {
            maxFileSize: 250 * GB,
            bandwidth: 250 * GB,
            maxExpiryDays: 30,
            customKey: true,
            downloadLimits: true,
            noBranding: true,
            downloadNotifications: true,
            filePreview: true,
            apiRequests: 100_000,
        },
    },
    form: {
        free: {
            forms: 3,
            submissionsPerMonth: 50,
            retentionDays: 30,
            removeBranding: false,
            customKey: false,
            maxSubmissionFileSize: 100 * 1024 * 1024,
            apiRequests: 500,
        },
        plus: {
            forms: 10,
            submissionsPerMonth: 1000,
            retentionDays: 90,
            removeBranding: false,
            customKey: true,
            maxSubmissionFileSize: 5 * GB,
            apiRequests: 25_000,
        },
        pro: {
            forms: 30,
            submissionsPerMonth: 10000,
            retentionDays: 365,
            removeBranding: true,
            customKey: true,
            maxSubmissionFileSize: 50 * GB,
            apiRequests: 100_000,
        },
    },
} as const satisfies {
    alias: Record<"free" | PaidTier, AliasEntitlements>;
    drop: Record<Tier, DropEntitlements>;
    form: Record<"free" | PaidTier, FormEntitlements>;
};

// ─── Backward-compatible limit exports (derived from PLAN_ENTITLEMENTS) ────

export const ALIAS_LIMITS = PLAN_ENTITLEMENTS.alias;

export const DROP_SIZE_LIMITS = {
    guest: PLAN_ENTITLEMENTS.drop.guest.maxFileSize,
    free: PLAN_ENTITLEMENTS.drop.free.maxFileSize,
    plus: PLAN_ENTITLEMENTS.drop.plus.maxFileSize,
    pro: PLAN_ENTITLEMENTS.drop.pro.maxFileSize,
} as const;

export const STORAGE_LIMITS = {
    guest: PLAN_ENTITLEMENTS.drop.guest.bandwidth,
    free: PLAN_ENTITLEMENTS.drop.free.bandwidth,
    plus: PLAN_ENTITLEMENTS.drop.plus.bandwidth,
    pro: PLAN_ENTITLEMENTS.drop.pro.bandwidth,
} as const;

export const EXPIRY_LIMITS = {
    guest: PLAN_ENTITLEMENTS.drop.guest.maxExpiryDays,
    free: PLAN_ENTITLEMENTS.drop.free.maxExpiryDays,
    plus: PLAN_ENTITLEMENTS.drop.plus.maxExpiryDays,
    pro: PLAN_ENTITLEMENTS.drop.pro.maxExpiryDays,
} as const;

export const DROP_FEATURES = {
    guest: {
        customKey: PLAN_ENTITLEMENTS.drop.guest.customKey,
        downloadLimits: PLAN_ENTITLEMENTS.drop.guest.downloadLimits,
        noBranding: PLAN_ENTITLEMENTS.drop.guest.noBranding,
        downloadNotifications: PLAN_ENTITLEMENTS.drop.guest.downloadNotifications,
        filePreview: PLAN_ENTITLEMENTS.drop.guest.filePreview,
    },
    free: {
        customKey: PLAN_ENTITLEMENTS.drop.free.customKey,
        downloadLimits: PLAN_ENTITLEMENTS.drop.free.downloadLimits,
        noBranding: PLAN_ENTITLEMENTS.drop.free.noBranding,
        downloadNotifications: PLAN_ENTITLEMENTS.drop.free.downloadNotifications,
        filePreview: PLAN_ENTITLEMENTS.drop.free.filePreview,
    },
    plus: {
        customKey: PLAN_ENTITLEMENTS.drop.plus.customKey,
        downloadLimits: PLAN_ENTITLEMENTS.drop.plus.downloadLimits,
        noBranding: PLAN_ENTITLEMENTS.drop.plus.noBranding,
        downloadNotifications: PLAN_ENTITLEMENTS.drop.plus.downloadNotifications,
        filePreview: PLAN_ENTITLEMENTS.drop.plus.filePreview,
    },
    pro: {
        customKey: PLAN_ENTITLEMENTS.drop.pro.customKey,
        downloadLimits: PLAN_ENTITLEMENTS.drop.pro.downloadLimits,
        noBranding: PLAN_ENTITLEMENTS.drop.pro.noBranding,
        downloadNotifications: PLAN_ENTITLEMENTS.drop.pro.downloadNotifications,
        filePreview: PLAN_ENTITLEMENTS.drop.pro.filePreview,
    },
} as const;

export const DROP_LIMITS = {
    free: { apiRequests: PLAN_ENTITLEMENTS.drop.free.apiRequests },
    plus: { apiRequests: PLAN_ENTITLEMENTS.drop.plus.apiRequests },
    pro: { apiRequests: PLAN_ENTITLEMENTS.drop.pro.apiRequests },
} as const;

export const FORM_LIMITS = {
    free: { apiRequests: PLAN_ENTITLEMENTS.form.free.apiRequests },
    plus: { apiRequests: PLAN_ENTITLEMENTS.form.plus.apiRequests },
    pro: { apiRequests: PLAN_ENTITLEMENTS.form.pro.apiRequests },
} as const;

// Guest (unauthenticated) drop limits.
// Why: no persisted user row means no storageUsed counter — caps must be
// self-contained per drop. File count cap prevents fan-out abuse; total byte
// cap mirrors the single-file cap so a "split into many small files" attack
// can't exceed it either.
export const GUEST_MAX_FILES_PER_DROP = 5;
export const GUEST_MAX_DROP_BYTES = 100 * 1024 * 1024;

// ─── Helpers for generating feature strings from entitlements ──────────────

function formatBytes(bytes: number): string {
    const gb = bytes / GB;
    return gb >= 1 ? `${gb}GB` : `${Math.round(bytes / (1024 * 1024))}MB`;
}

function formatAliasCount(count: number, noun = "aliases", hideLimit = false): string {
    return (hideLimit || count === -1) ? `Unlimited ${noun}` : `${count} ${noun}`;
}

function aliasFeatureStrings(tier: "free" | PaidTier): { features: string[]; missingFeatures: string[] } {
    const e = PLAN_ENTITLEMENTS.alias[tier];
    const hidesRandomLimit = tier === "pro";
    const features: string[] = [
        formatAliasCount(e.random, "email aliases", hidesRandomLimit),
        `${e.custom} custom alias${e.custom !== 1 ? "es" : ""}`,
        `${e.recipients} email recipient${e.recipients !== 1 ? "s" : ""}`,
        ...(e.recipientsPerAlias > 1 ? [`${e.recipientsPerAlias} recipients per alias`] : []),
        ...(e.domains > 0 ? [`${e.domains} custom domain${(e.domains as number) !== 1 ? "s" : ""}`] : []),
        "PGP encryption",
        "Reply to emails",
        `${e.apiRequests.toLocaleString()} API requests/month`,
    ];
    const missingFeatures: string[] = [];
    if (tier === "free") {
        missingFeatures.push(`${PLAN_ENTITLEMENTS.alias.plus.random} aliases`, "Custom domains");
    } else if (tier === "plus") {
        missingFeatures.push(formatAliasCount(PLAN_ENTITLEMENTS.alias.pro.random, "aliases", true), `${PLAN_ENTITLEMENTS.alias.pro.domains} custom domains`);
    }
    return { features, missingFeatures };
}

function dropFeatureStrings(tier: "free" | PaidTier): { features: string[]; missingFeatures: string[] } {
    const e = PLAN_ENTITLEMENTS.drop[tier];
    const features: string[] = [
        `${formatBytes(e.bandwidth)} bandwidth`,
        `${formatBytes(e.maxFileSize)} max file size`,
        `${e.maxExpiryDays}-day file expiry`,
        "End-to-end encryption",
        ...(e.customKey ? ["Password protection"] : []),
        ...(e.downloadLimits ? ["Download limits"] : []),
        ...(e.downloadNotifications ? ["Download notifications"] : []),
        ...(e.noBranding ? ["Remove branding"] : []),
    ];
    const missingFeatures: string[] = [];
    if (tier === "free") {
        missingFeatures.push("Password protection", `${formatBytes(PLAN_ENTITLEMENTS.drop.plus.bandwidth)} bandwidth`, `${PLAN_ENTITLEMENTS.drop.plus.maxExpiryDays}-day expiry`);
    } else if (tier === "plus") {
        missingFeatures.push(`${formatBytes(PLAN_ENTITLEMENTS.drop.pro.bandwidth)} bandwidth`, `${PLAN_ENTITLEMENTS.drop.pro.maxExpiryDays}-day file expiry`);
    }
    return { features, missingFeatures };
}

function formatCount(n: number, noun: string): string {
    return n === -1 ? `Unlimited ${noun}` : `${n.toLocaleString()} ${noun}`;
}

function formFeatureStrings(tier: "free" | PaidTier): { features: string[]; missingFeatures: string[] } {
    const e = PLAN_ENTITLEMENTS.form[tier];
    const features: string[] = [
        formatCount(e.forms, "forms"),
        `${formatCount(e.submissionsPerMonth, "submissions")}/month`,
        `${e.retentionDays}-day submission retention`,
        "End-to-end encryption",
        ...(e.customKey ? ["Password-protected forms"] : []),
        ...(e.maxSubmissionFileSize > 0 ? [`${formatBytes(e.maxSubmissionFileSize)} file attachments`] : []),
        ...(e.removeBranding ? ["Remove branding"] : []),
    ];
    const missingFeatures: string[] = [];
    if (tier === "free") {
        missingFeatures.push("Password-protected forms", "Remove branding", `${PLAN_ENTITLEMENTS.form.plus.submissionsPerMonth.toLocaleString()} submissions/month`);
    } else if (tier === "plus") {
        missingFeatures.push("Remove branding", `${PLAN_ENTITLEMENTS.form.pro.submissionsPerMonth.toLocaleString()} submissions/month`);
    }
    return { features, missingFeatures };
}

// ─── Plan definitions (pricing + feature display) ──────────────────────────

export interface PlanDefinition {
    id: string;
    name: string;
    description: string;
    price: {
        monthly: number;
        yearly: number;
    };
    priceIds?: {
        monthly: string;
        yearly: string;
    };
    features: string[];
    featureSections?: {
        name: string;
        features: string[];
        missingFeatures?: string[];
    }[];
    missingFeatures: string[];
}

function bundlePlan(tier: "free" | PaidTier, opts: {
    name: string; description: string;
    price: { monthly: number; yearly: number };
    priceIds?: { monthly: string; yearly: string };
}): PlanDefinition {
    const alias = aliasFeatureStrings(tier);
    const drop = dropFeatureStrings(tier);
    const form = formFeatureStrings(tier);
    return {
        id: `bundle_${tier}`,
        name: opts.name,
        description: opts.description,
        price: opts.price,
        priceIds: opts.priceIds,
        features: [
            ...alias.features.slice(0, 3),
            ...drop.features.slice(0, 3),
            ...form.features.slice(0, 3),
            ...alias.features.slice(3),
            ...drop.features.slice(3),
            ...form.features.slice(3),
        ],
        featureSections: [
            { name: "Alias Features", features: alias.features, missingFeatures: alias.missingFeatures },
            { name: "File Features", features: drop.features, missingFeatures: drop.missingFeatures },
            { name: "Form Features", features: form.features, missingFeatures: form.missingFeatures },
        ],
        missingFeatures: [],
    };
}

export const BUNDLE_PLANS: Record<"free" | "plus" | "pro", PlanDefinition> = {
    free: bundlePlan("free", {
        name: "Free",
        description: "Get started with anon.li",
        price: { monthly: 0, yearly: 0 },
    }),
    plus: bundlePlan("plus", {
        name: "Plus",
        description: "Privacy essentials",
        price: { monthly: 6.99, yearly: 69.49 },
        priceIds: {
            monthly: process.env.STRIPE_BUNDLE_PLUS_MONTHLY_PRICE_ID!,
            yearly: process.env.STRIPE_BUNDLE_PLUS_YEARLY_PRICE_ID!,
        },
    }),
    pro: bundlePlan("pro", {
        name: "Pro",
        description: "Maximum privacy & features",
        price: { monthly: 9.99, yearly: 89.89 },
        priceIds: {
            monthly: process.env.STRIPE_BUNDLE_PRO_MONTHLY_PRICE_ID!,
            yearly: process.env.STRIPE_BUNDLE_PRO_YEARLY_PRICE_ID!,
        },
    }),
};

function productPlan(product: "alias" | "drop" | "form", tier: "free" | PaidTier, opts: {
    name: string; description: string;
    price: { monthly: number; yearly: number };
    priceIds?: { monthly: string; yearly: string };
}): PlanDefinition {
    const gen = product === "alias"
        ? aliasFeatureStrings(tier)
        : product === "drop"
            ? dropFeatureStrings(tier)
            : formFeatureStrings(tier);
    return {
        id: `${product}_${tier}`,
        name: opts.name,
        description: opts.description,
        price: opts.price,
        priceIds: opts.priceIds,
        features: gen.features,
        missingFeatures: gen.missingFeatures,
    };
}

export const ALIAS_PLANS: Record<"free" | "plus" | "pro", PlanDefinition> = {
    free: productPlan("alias", "free", {
        name: "Free", description: "Basic email aliasing",
        price: { monthly: 0, yearly: 0 },
    }),
    plus: productPlan("alias", "plus", {
        name: "Plus", description: "Email privacy powerhouse",
        price: { monthly: 2.49, yearly: 23.89 },
        priceIds: {
            monthly: process.env.STRIPE_ALIAS_PLUS_MONTHLY_PRICE_ID!,
            yearly: process.env.STRIPE_ALIAS_PLUS_YEARLY_PRICE_ID!,
        },
    }),
    pro: productPlan("alias", "pro", {
        name: "Pro", description: "Ultimate email privacy",
        price: { monthly: 3.49, yearly: 35.89 },
        priceIds: {
            monthly: process.env.STRIPE_ALIAS_PRO_MONTHLY_PRICE_ID!,
            yearly: process.env.STRIPE_ALIAS_PRO_YEARLY_PRICE_ID!,
        },
    }),
};

export const DROP_PLANS: Record<"free" | "plus" | "pro", PlanDefinition> = {
    free: productPlan("drop", "free", {
        name: "Free", description: "Basic drop sharing",
        price: { monthly: 0, yearly: 0 },
    }),
    plus: productPlan("drop", "plus", {
        name: "Plus", description: "More storage & features",
        price: { monthly: 2.99, yearly: 29.89 },
        priceIds: {
            monthly: process.env.STRIPE_DROP_PLUS_MONTHLY_PRICE_ID!,
            yearly: process.env.STRIPE_DROP_PLUS_YEARLY_PRICE_ID!,
        },
    }),
    pro: productPlan("drop", "pro", {
        name: "Pro", description: "Maximum storage & privacy",
        price: { monthly: 4.49, yearly: 45.49 },
        priceIds: {
            monthly: process.env.STRIPE_DROP_PRO_MONTHLY_PRICE_ID!,
            yearly: process.env.STRIPE_DROP_PRO_YEARLY_PRICE_ID!,
        },
    }),
};

export const FORM_PLANS: Record<"free" | "plus" | "pro", PlanDefinition> = {
    free: productPlan("form", "free", {
        name: "Free", description: "Private forms for small teams",
        price: { monthly: 0, yearly: 0 },
    }),
    plus: productPlan("form", "plus", {
        name: "Plus", description: "More submissions & retention",
        price: { monthly: 3.99, yearly: 39.49 },
        priceIds: {
            monthly: process.env.STRIPE_FORM_PLUS_MONTHLY_PRICE_ID!,
            yearly: process.env.STRIPE_FORM_PLUS_YEARLY_PRICE_ID!,
        },
    }),
    pro: productPlan("form", "pro", {
        name: "Pro", description: "Serious intake workflows",
        price: { monthly: 5.99, yearly: 53.89 },
        priceIds: {
            monthly: process.env.STRIPE_FORM_PRO_MONTHLY_PRICE_ID!,
            yearly: process.env.STRIPE_FORM_PRO_YEARLY_PRICE_ID!,
        },
    }),
};

// ─── Price ID → plan resolution ────────────────────────────────────────────

const ALL_PLAN_DEFS: { plans: Record<string, PlanDefinition>; product: Product }[] = [
    { plans: BUNDLE_PLANS, product: "bundle" },
    { plans: ALIAS_PLANS, product: "alias" },
    { plans: DROP_PLANS, product: "drop" },
    { plans: FORM_PLANS, product: "form" },
];

export function getPlanFromPriceId(priceId: string): { product: Product; tier: Tier } | null {
    for (const { plans, product } of ALL_PLAN_DEFS) {
        for (const [tier, plan] of Object.entries(plans)) {
            if (plan.priceIds?.monthly === priceId || plan.priceIds?.yearly === priceId) {
                return { product, tier: tier as Tier };
            }
        }
    }
    return null;
}
