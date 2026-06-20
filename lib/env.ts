import { z } from "zod";

/**
 * Environment variable validation using Zod
 * This ensures all required environment variables are set at build/startup time
 * rather than failing at runtime with cryptic errors.
 */

const serverEnvSchema = z.object({
    DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),

    AUTH_SECRET: z.string().min(1, "AUTH_SECRET is required"),
    AUTH_RESEND_KEY: z.string().min(1, "AUTH_RESEND_KEY is required"),

    // Stripe
    STRIPE_SECRET_KEY: z.string().min(1, "STRIPE_SECRET_KEY is required"),
    STRIPE_WEBHOOK_SECRET: z.string().min(1, "STRIPE_WEBHOOK_SECRET is required"),

    // Storage (Cloudflare R2)
    R2_ACCESS_KEY_ID: z.string().min(1, "R2_ACCESS_KEY_ID is required"),
    R2_SECRET_ACCESS_KEY: z.string().min(1, "R2_SECRET_ACCESS_KEY is required"),
    // R2 S3-compatible endpoint: https://<account_id>.r2.cloudflarestorage.com
    R2_ENDPOINT: z.string().url("R2_ENDPOINT must be a valid URL"),
    R2_BUCKET_NAME: z.string().min(1, "R2_BUCKET_NAME is required"),
    // Public custom domain for R2 bucket (e.g. https://r2.anon.li).
    // Presigned download URLs are signed against this host so browser traffic
    // flows directly through R2 with zero egress fees, bypassing our Next.js
    // servers entirely.
    R2_PUBLIC_ENDPOINT: z.string().url("R2_PUBLIC_ENDPOINT must be a valid URL"),

    // Rate Limiting (Upstash Redis)
    UPSTASH_REDIS_REST_URL: z.string().min(1, "UPSTASH_REDIS_REST_URL is required"),
    UPSTASH_REDIS_REST_TOKEN: z.string().min(1, "UPSTASH_REDIS_REST_TOKEN is required"),

    // Cron Protection
    CRON_SECRET: z.string().min(1, "CRON_SECRET is required"),

    // Abuse Reporting
    IP_HASH_PEPPER: z.string().min(1, "IP_HASH_PEPPER is required"),
    REPORT_ENCRYPTION_KEY: z.string().min(1, "REPORT_ENCRYPTION_KEY is required"),

    // DKIM Key Encryption
    DKIM_ENCRYPTION_KEY: z.string().min(1, "DKIM_ENCRYPTION_KEY is required"),

    // Turnstile
    TURNSTILE_SECRET_KEY: z.string().min(1, "TURNSTILE_SECRET_KEY is required"),

    // OAuth (optional)
    AUTH_GITHUB_ID: z.string().optional(),
    AUTH_GITHUB_SECRET: z.string().optional(),
    AUTH_GOOGLE_ID: z.string().optional(),
    AUTH_GOOGLE_SECRET: z.string().optional(),

    // NowPayments (optional crypto payment provider)
    NOWPAYMENTS_API_KEY: z.string().optional(),
    NOWPAYMENTS_IPN_SECRET: z.string().optional(),

    // Stripe Price IDs (required when Stripe checkout is active)
    STRIPE_BUNDLE_PLUS_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_BUNDLE_PLUS_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_BUNDLE_PRO_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_BUNDLE_PRO_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_ALIAS_PLUS_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_ALIAS_PLUS_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_ALIAS_PRO_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_ALIAS_PRO_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_DROP_PLUS_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_DROP_PLUS_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_DROP_PRO_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_DROP_PRO_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_FORM_PLUS_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_FORM_PLUS_YEARLY_PRICE_ID: z.string().optional(),
    STRIPE_FORM_PRO_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_FORM_PRO_YEARLY_PRICE_ID: z.string().optional(),

    // Business (Teams) — per-seat
    STRIPE_BUSINESS_MONTHLY_PRICE_ID: z.string().optional(),
    STRIPE_BUSINESS_YEARLY_PRICE_ID: z.string().optional(),

    // Analytics & observability — PostHog (optional). The project token is read
    // from NEXT_PUBLIC_POSTHOG_KEY; this is the server (posthog-node) host.
    POSTHOG_HOST: z.string().optional(),
});

const clientEnvSchema = z.object({
    NEXT_PUBLIC_APP_URL: z.string().min(1, "NEXT_PUBLIC_APP_URL is required"),
    NEXT_PUBLIC_TURNSTILE_SITE_KEY: z.string().min(1, "NEXT_PUBLIC_TURNSTILE_SITE_KEY is required"),
    NEXT_PUBLIC_POSTHOG_KEY: z.string().optional(),
    NEXT_PUBLIC_POSTHOG_HOST: z.string().optional(),
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
