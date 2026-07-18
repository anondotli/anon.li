/**
 * @vitest-environment node
 */
import crypto from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { validateCronAuth } from "@/lib/cron-auth";

const originalSecret = process.env.CRON_SECRET;

afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
});

describe("validateCronAuth", () => {
    it("accepts the base secret Vercel sends", () => {
        process.env.CRON_SECRET = "a-production-length-test-cron-secret";
        const request = new Request("https://example.com/api/cron/cleanup", {
            headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
        });

        expect(validateCronAuth(request, "cleanup")).toBe(true);
    });

    it("accepts only the matching scope-derived token", () => {
        process.env.CRON_SECRET = "a-production-length-test-cron-secret";
        const token = crypto
            .createHmac("sha256", process.env.CRON_SECRET)
            .update("cron:cleanup")
            .digest("hex");
        const request = new Request("https://example.com/api/cron/cleanup", {
            headers: { authorization: `Bearer ${token}` },
        });

        expect(validateCronAuth(request, "cleanup")).toBe(true);
        expect(validateCronAuth(request, "billing")).toBe(false);
    });

    it.each([
        "Basic a-production-length-test-cron-secret",
        "Bearer a-production-length-test-cron-secret extra",
        "Bearer  a-production-length-test-cron-secret",
        "Bearer ",
    ])("rejects malformed authorization header: %s", (authorization) => {
        process.env.CRON_SECRET = "a-production-length-test-cron-secret";
        const request = new Request("https://example.com/api/cron/cleanup", {
            headers: { authorization },
        });

        expect(validateCronAuth(request, "cleanup")).toBe(false);
    });
});
