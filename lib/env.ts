import { z } from "zod";
import { parseHttpsOrLoopbackHttpUrl } from "@/lib/url-safety";

/**
 * Environment variable validation using Zod
 * This ensures all required environment variables are set at build/startup time
 * rather than failing at runtime with cryptic errors.
 */

const emptyToUndefined = (value: unknown) => value === "" ? undefined : value;
const requiredString = (name: string) => z.string().trim().min(1, `${name} is required`);
const secret = (name: string) => z.string().trim().min(32, `${name} must be at least 32 characters`);
const optionalString = z.preprocess(
    emptyToUndefined,
    z.string().trim().min(1).max(2_048).optional(),
);
const optionalStripePriceId = z.preprocess(
    emptyToUndefined,
    z.string().trim().regex(/^price_[A-Za-z0-9_]+$/, "must be a Stripe price ID").optional(),
);
const httpsOrLoopbackUrl = (name: string) => z.string().trim().max(2_048).refine(
    (value) => parseHttpsOrLoopbackHttpUrl(value) !== null,
    `${name} must use HTTPS (HTTP is allowed only for loopback development)`,
);
const originUrl = (name: string) => httpsOrLoopbackUrl(name).refine((value) => {
    const url = parseHttpsOrLoopbackHttpUrl(value);
    return Boolean(url && url.pathname === "/" && !url.search && !url.hash);
}, `${name} must be an origin without a path, query, or fragment`);
const databaseUrl = z.string().trim().max(4_096).refine((value) => {
    try {
        const url = new URL(value);
        return url.protocol === "postgresql:" || url.protocol === "postgres:";
    } catch {
        return false;
    }
}, "DATABASE_URL must be a valid PostgreSQL URL");
const optionalPostHogClientHost = z.preprocess(emptyToUndefined, z.string().trim().max(2_048).refine(
    (value) => (
        (/^\/(?!\/)[^?#]*$/.test(value) && !value.includes(".."))
        || parseHttpsOrLoopbackHttpUrl(value) !== null
    ),
    "NEXT_PUBLIC_POSTHOG_HOST must be a root-relative proxy path or a secure URL",
).optional());

const serverEnvSchema = z.object({
    DATABASE_URL: databaseUrl,

    AUTH_SECRET: secret("AUTH_SECRET"),
    AUTH_RESEND_KEY: requiredString("AUTH_RESEND_KEY"),

    // Stripe
    STRIPE_SECRET_KEY: requiredString("STRIPE_SECRET_KEY"),
    STRIPE_WEBHOOK_SECRET: requiredString("STRIPE_WEBHOOK_SECRET"),

    // Storage (Cloudflare R2)
    R2_ACCESS_KEY_ID: requiredString("R2_ACCESS_KEY_ID"),
    R2_SECRET_ACCESS_KEY: requiredString("R2_SECRET_ACCESS_KEY"),
    // R2 S3-compatible endpoint: https://<account_id>.r2.cloudflarestorage.com
    R2_ENDPOINT: originUrl("R2_ENDPOINT"),
    R2_BUCKET_NAME: requiredString("R2_BUCKET_NAME"),

    // Rate Limiting (Upstash Redis)
    UPSTASH_REDIS_REST_URL: originUrl("UPSTASH_REDIS_REST_URL"),
    UPSTASH_REDIS_REST_TOKEN: requiredString("UPSTASH_REDIS_REST_TOKEN"),
    // Vercel is detected automatically. Set this only for a self-hosted origin
    // whose network/firewall accepts requests exclusively from Cloudflare.
    TRUSTED_PROXY_PROVIDER: z.preprocess(
        (value) => value === "" ? undefined : value,
        z.enum(["vercel", "cloudflare"]).optional(),
    ),

    // Cron Protection
    CRON_SECRET: secret("CRON_SECRET"),

    // Abuse Reporting
    IP_HASH_PEPPER: secret("IP_HASH_PEPPER"),
    REPORT_ENCRYPTION_KEY: z.string().trim().regex(/^[0-9a-fA-F]{64}$/, "REPORT_ENCRYPTION_KEY must be 64 hexadecimal characters"),

    // DKIM Key Encryption
    DKIM_ENCRYPTION_KEY: z.string().trim().regex(/^[0-9a-fA-F]{64}$/, "DKIM_ENCRYPTION_KEY must be 64 hexadecimal characters"),

    // Turnstile
    TURNSTILE_SECRET_KEY: requiredString("TURNSTILE_SECRET_KEY"),

    // OAuth (optional)
    AUTH_GITHUB_ID: optionalString,
    AUTH_GITHUB_SECRET: optionalString,
    AUTH_GOOGLE_ID: optionalString,
    AUTH_GOOGLE_SECRET: optionalString,

    // NowPayments (optional crypto payment provider)
    NOWPAYMENTS_API_KEY: optionalString,
    NOWPAYMENTS_IPN_SECRET: optionalString,

    // Stripe Price IDs (required when Stripe checkout is active)
    STRIPE_BUNDLE_PLUS_MONTHLY_PRICE_ID: optionalStripePriceId,
    STRIPE_BUNDLE_PLUS_YEARLY_PRICE_ID: optionalStripePriceId,
    STRIPE_BUNDLE_PRO_MONTHLY_PRICE_ID: optionalStripePriceId,
    STRIPE_BUNDLE_PRO_YEARLY_PRICE_ID: optionalStripePriceId,
    STRIPE_ALIAS_PLUS_MONTHLY_PRICE_ID: optionalStripePriceId,
    STRIPE_ALIAS_PLUS_YEARLY_PRICE_ID: optionalStripePriceId,
    STRIPE_ALIAS_PRO_MONTHLY_PRICE_ID: optionalStripePriceId,
    STRIPE_ALIAS_PRO_YEARLY_PRICE_ID: optionalStripePriceId,
    STRIPE_DROP_PLUS_MONTHLY_PRICE_ID: optionalStripePriceId,
    STRIPE_DROP_PLUS_YEARLY_PRICE_ID: optionalStripePriceId,
    STRIPE_DROP_PRO_MONTHLY_PRICE_ID: optionalStripePriceId,
    STRIPE_DROP_PRO_YEARLY_PRICE_ID: optionalStripePriceId,
    STRIPE_FORM_PLUS_MONTHLY_PRICE_ID: optionalStripePriceId,
    STRIPE_FORM_PLUS_YEARLY_PRICE_ID: optionalStripePriceId,
    STRIPE_FORM_PRO_MONTHLY_PRICE_ID: optionalStripePriceId,
    STRIPE_FORM_PRO_YEARLY_PRICE_ID: optionalStripePriceId,

    // Business (Teams) — per-seat
    STRIPE_BUSINESS_MONTHLY_PRICE_ID: optionalStripePriceId,
    STRIPE_BUSINESS_YEARLY_PRICE_ID: optionalStripePriceId,

    // Analytics & observability — PostHog (optional). The project token is read
    // from NEXT_PUBLIC_POSTHOG_KEY; this is the server (posthog-node) host.
    POSTHOG_HOST: z.preprocess(emptyToUndefined, httpsOrLoopbackUrl("POSTHOG_HOST").optional()),
}).superRefine((env, context) => {
    const pairs = [
        ["AUTH_GITHUB_ID", "AUTH_GITHUB_SECRET"],
        ["AUTH_GOOGLE_ID", "AUTH_GOOGLE_SECRET"],
        ["NOWPAYMENTS_API_KEY", "NOWPAYMENTS_IPN_SECRET"],
    ] as const;

    for (const [first, second] of pairs) {
        if (Boolean(env[first]) !== Boolean(env[second])) {
            const missing = env[first] ? second : first;
            context.addIssue({
                code: "custom",
                path: [missing],
                message: `${first} and ${second} must be configured together`,
            });
        }
    }
});

const clientEnvSchema = z.object({
    NEXT_PUBLIC_APP_URL: originUrl("NEXT_PUBLIC_APP_URL"),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: requiredString("NEXT_PUBLIC_TURNSTILE_SITE_KEY"),
    NEXT_PUBLIC_POSTHOG_KEY: optionalString,
    NEXT_PUBLIC_POSTHOG_HOST: optionalPostHogClientHost,
});

type ServerEnv = z.infer<typeof serverEnvSchema>;
type ClientEnv = z.infer<typeof clientEnvSchema>;

/**
 * Validate server environment variables
 * Call this at application startup to fail fast if configuration is invalid
 */
export function validateServerEnv(): ServerEnv {
    const result = serverEnvSchema.safeParse(process.env);

    if (!result.success) {
        const errors = result.error.issues.map(
            (issue) => `  - ${issue.path.join(".")}: ${issue.message}`
        );
        throw new Error(
            `❌ Invalid server environment configuration:\n${errors.join("\n")}\n\n` +
            `Please check your .env file and ensure all required variables are set.`
        );
    }

    return result.data;
}

/**
 * Validate client environment variables
 */
export function validateClientEnv(): ClientEnv {
    const result = clientEnvSchema.safeParse({
        NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
        NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
        NEXT_PUBLIC_POSTHOG_KEY: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        NEXT_PUBLIC_POSTHOG_HOST: process.env.NEXT_PUBLIC_POSTHOG_HOST,
    });

    if (!result.success) {
        const errors = result.error.issues.map(
            (issue) => `  - ${issue.path.join(".")}: ${issue.message}`
        );
        throw new Error(
            `❌ Invalid client environment configuration:\n${errors.join("\n")}`
        );
    }

    return result.data;
}
