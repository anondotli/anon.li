/**
 * @vitest-environment node
 */
import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

type VercelConfig = {
    $schema?: string;
    crons?: Array<{ path: string; schedule: string }>;
};

async function readConfig(): Promise<VercelConfig> {
    return JSON.parse(await readFile(path.join(process.cwd(), "vercel.json"), "utf8")) as VercelConfig;
}

describe("Vercel cron configuration", () => {
    it("schedules each production job exactly once", async () => {
        const config = await readConfig();
        const paths = config.crons?.map((cron) => cron.path) ?? [];

        expect(config.$schema).toBe("https://openapi.vercel.sh/vercel.json");
        expect(paths).toEqual([
            "/api/cron/domains",
            "/api/cron/billing",
            "/api/cron/cleanup",
            "/api/cron/drip",
            "/api/cron/crypto-recovery",
            "/api/cron/business-snapshot",
            "/api/cron/heavy-user-upsell",
        ]);
        expect(new Set(paths).size).toBe(paths.length);
        expect(paths).not.toContain("/api/cron/daily");
        expect(paths).not.toContain("/api/cron/form-staging");
    });

    it("keeps every schedule compatible with Vercel Hobby", async () => {
        const config = await readConfig();

        for (const cron of config.crons ?? []) {
            const fields = cron.schedule.trim().split(/\s+/);
            expect(fields, `${cron.path} must use five-field cron syntax`).toHaveLength(5);

            const [minute, hour] = fields;
            expect(minute, `${cron.path} must run at one minute per eligible day`).toMatch(/^\d+$/);
            expect(hour, `${cron.path} must run at one hour per eligible day`).toMatch(/^\d+$/);
            expect(Number(minute)).toBeLessThan(60);
            expect(Number(hour)).toBeLessThan(24);
        }
    });

    it("points every configured path at a route handler", async () => {
        const config = await readConfig();

        for (const cron of config.crons ?? []) {
            const routeFile = path.join(process.cwd(), "app", cron.path, "route.ts");
            await expect(access(routeFile)).resolves.toBeUndefined();
        }
    });
});
