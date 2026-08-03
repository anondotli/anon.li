/**
 * @vitest-environment node
 */
import { afterEach, describe, expect, it } from "vitest";
import { validateClientEnv, validateServerEnv } from "@/lib/env";

const originalEnv = { ...process.env };

function validServerEnv(): NodeJS.ProcessEnv {
    return {
        ...originalEnv,
        DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/anonli",
        AUTH_SECRET: "a".repeat(32),
        AUTH_RESEND_KEY: "re_test",
        STRIPE_SECRET_KEY: "sk_test",
        STRIPE_WEBHOOK_SECRET: "whsec_test",
        R2_ACCESS_KEY_ID: "r2-access",
        R2_SECRET_ACCESS_KEY: "r2-secret",
        R2_ENDPOINT: "https://account.r2.cloudflarestorage.com",
        R2_BUCKET_NAME: "private-bucket",
        UPSTASH_REDIS_REST_URL: "https://redis.example.test",
        UPSTASH_REDIS_REST_TOKEN: "redis-token",
        CRON_SECRET: "b".repeat(32),
        IP_HASH_PEPPER: "c".repeat(32),
        REPORT_ENCRYPTION_KEY: "d".repeat(64),
        DKIM_ENCRYPTION_KEY: "e".repeat(64),
        TURNSTILE_SECRET_KEY: "turnstile-secret",
    };
}

afterEach(() => {
    process.env = { ...originalEnv };
});

describe("environment validation", () => {
    it("accepts secure production URLs and normalizes blank optional values", () => {
        process.env = {
            ...validServerEnv(),
            AUTH_GITHUB_ID: "",
            AUTH_GITHUB_SECRET: "",
        };

        expect(validateServerEnv().AUTH_GITHUB_ID).toBeUndefined();
    });

    it("allows HTTP only on loopback development origins", () => {
        process.env = {
            ...validServerEnv(),
            NEXT_PUBLIC_APP_URL: "http://localhost:3000",
            NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key",
        };
        expect(validateClientEnv().NEXT_PUBLIC_APP_URL).toBe("http://localhost:3000");

        process.env.NEXT_PUBLIC_APP_URL = "http://example.com";
        expect(() => validateClientEnv()).toThrow("must use HTTPS");
    });

    it("rejects app URLs with path, query, credentials, or fragments", () => {
        for (const appUrl of [
            "https://example.com/app",
            "https://example.com?tenant=1",
            "https://user:pass@example.com",
            "https://example.com/#fragment",
        ]) {
            process.env = {
                ...validServerEnv(),
                NEXT_PUBLIC_APP_URL: appUrl,
                NEXT_PUBLIC_TURNSTILE_SITE_KEY: "site-key",
            };
            expect(() => validateClientEnv(), appUrl).toThrow();
        }
    });

    it("rejects weak secrets and malformed encryption keys", () => {
        process.env = {
            ...validServerEnv(),
            AUTH_SECRET: "short",
            REPORT_ENCRYPTION_KEY: "not-hex",
        };
        expect(() => validateServerEnv()).toThrow("AUTH_SECRET must be at least 32 characters");
        expect(() => validateServerEnv()).toThrow("REPORT_ENCRYPTION_KEY must be 64 hexadecimal characters");
    });

    it("requires OAuth and crypto provider credentials in pairs", () => {
        process.env = {
            ...validServerEnv(),
            AUTH_GITHUB_ID: "github-client",
            AUTH_GITHUB_SECRET: "",
            NOWPAYMENTS_API_KEY: "now-key",
            NOWPAYMENTS_IPN_SECRET: "",
        };
        expect(() => validateServerEnv()).toThrow("AUTH_GITHUB_ID and AUTH_GITHUB_SECRET must be configured together");
        expect(() => validateServerEnv()).toThrow("NOWPAYMENTS_API_KEY and NOWPAYMENTS_IPN_SECRET must be configured together");
    });
});
