/**
 * Tests for the /api/cron/daily aggregator (Vercel Hobby caps vercel.json
 * at three cron entries; this route fans out to the dedicated job routes).
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET as runDaily } from "@/app/api/cron/daily/route";

const originalSecret = process.env.CRON_SECRET;
const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
const originalVercelUrl = process.env.VERCEL_URL;

const DAILY_JOB_PATHS = [
    "https://example.com/api/cron/domains",
    "https://example.com/api/cron/billing",
    "https://example.com/api/cron/cleanup",
    "https://example.com/api/cron/drip",
    "https://example.com/api/cron/crypto-recovery",
    "https://example.com/api/cron/business-snapshot",
];

function jsonResponse(status: number, body: unknown): Response {
    return new Response(JSON.stringify(body), {
        status,
        headers: { "content-type": "application/json" },
    });
}

const authorizedRequest = () =>
    new Request("https://example.com/api/cron/daily", {
        headers: { authorization: "Bearer test-cron-secret" },
    });

describe("daily cron aggregator", () => {
    beforeEach(() => {
        process.env.CRON_SECRET = "test-cron-secret";
        process.env.NEXT_PUBLIC_APP_URL = "https://example.com";
        delete process.env.VERCEL_URL;
    });

    afterEach(() => {
        if (originalSecret === undefined) delete process.env.CRON_SECRET;
        else process.env.CRON_SECRET = originalSecret;
        if (originalAppUrl === undefined) delete process.env.NEXT_PUBLIC_APP_URL;
        else process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
        if (originalVercelUrl === undefined) delete process.env.VERCEL_URL;
        else process.env.VERCEL_URL = originalVercelUrl;
        vi.unstubAllGlobals();
    });

    it("returns 401 without auth", async () => {
        const fetchMock = vi.fn();
        vi.stubGlobal("fetch", fetchMock);

        const response = await runDaily(new Request("https://example.com/api/cron/daily") as never);

        expect(response.status).toBe(401);
        expect(fetchMock).not.toHaveBeenCalled();
    });

    it("dispatches every daily job in order with the base cron secret", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
        vi.stubGlobal("fetch", fetchMock);

        const response = await runDaily(authorizedRequest() as never);
        const body = await response.json();

        expect(response.status).toBe(200);
        expect(body.success).toBe(true);
        expect(body.failed).toBeUndefined();

        const urls = fetchMock.mock.calls.map(([url]) => url);
        expect(urls).toEqual(DAILY_JOB_PATHS);
        for (const [, init] of fetchMock.mock.calls) {
            expect(init.headers.authorization).toBe("Bearer test-cron-secret");
            expect(init.cache).toBe("no-store");
        }
    });

    it("ignores the incoming host when dispatching the base cron secret", async () => {
        const fetchMock = vi.fn().mockResolvedValue(jsonResponse(200, { success: true }));
        vi.stubGlobal("fetch", fetchMock);

        const response = await runDaily(new Request("https://attacker.example/api/cron/daily", {
            headers: { authorization: "Bearer test-cron-secret" },
        }) as never);

        expect(response.status).toBe(200);
        expect(fetchMock.mock.calls.map(([url]) => url)).toEqual(DAILY_JOB_PATHS);
    });

    it("returns 500 and names failed jobs while still running the rest", async () => {
        const fetchMock = vi.fn().mockImplementation((url: string) => {
            if (url.endsWith("/api/cron/billing")) {
                return Promise.resolve(jsonResponse(500, { success: false }));
            }
            if (url.endsWith("/api/cron/drip")) {
                return Promise.reject(new Error("network down"));
            }
            return Promise.resolve(jsonResponse(200, { success: true }));
        });
        vi.stubGlobal("fetch", fetchMock);

        const response = await runDaily(authorizedRequest() as never);
        const body = await response.json();

        expect(response.status).toBe(500);
        expect(body.success).toBe(false);
        expect(body.failed).toEqual(["billing", "drip"]);
        // Jobs scheduled after a failure must still be dispatched.
        expect(fetchMock).toHaveBeenCalledTimes(DAILY_JOB_PATHS.length);
        expect(body.results.domains.ok).toBe(true);
        expect(body.results.billing.ok).toBe(false);
        expect(body.results.drip.ok).toBe(false);
        expect(body.results["crypto-recovery"].ok).toBe(true);
        expect(body.results["business-snapshot"].ok).toBe(true);
    });
});
