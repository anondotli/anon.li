import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";

const logger = createLogger("CronDaily");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily workloads dispatched by this aggregator, in priority order.
 *
 * Vercel Hobby allows at most three cron entries, so the per-job schedules
 * are consolidated here. Each job is invoked as an internal HTTP call to its
 * own dedicated route, which keeps the reliability model intact: every job
 * still runs in its own function invocation with its own auth scope, Redis
 * lock, maxDuration budget, and error reporting, so one slow or failing
 * workload cannot consume another's function budget.
 *
 * Jobs are awaited sequentially (not concurrently) so overlapping database
 * writes between workloads stay as impossible as they were when the jobs ran
 * hours apart. At current scale the combined runtime is far below this
 * route's own 300-second budget.
 *
 * The weekly heavy-user upsell keeps its own vercel.json entry.
 */
const DAILY_JOBS = [
    "domains",
    "billing",
    "cleanup",
    "drip",
    "crypto-recovery",
    "business-snapshot",
] as const;

type JobResult = {
    ok: boolean;
    status?: number;
    body?: unknown;
    error?: string;
};

async function handleCron(req: NextRequest) {
    if (!validateCronAuth(req, "daily")) {
        return new NextResponse("Unauthorized", { status: 401 });
    }

    const token = process.env.CRON_SECRET;
    if (!token) {
        // validateCronAuth rejects when the secret is missing, so this is only
        // reachable on a misconfigured env race; fail loudly rather than
        // dispatch unauthenticated requests.
        logger.error("CRON_SECRET is not configured; cannot dispatch daily jobs");
        return new NextResponse("Internal Server Error", { status: 500 });
    }

    // Derive the base URL from the incoming request so dispatch works on
    // production, preview deployments, and local dev without extra env vars.
    const origin = new URL(req.url).origin;
    const results: Record<string, JobResult> = {};

    for (const job of DAILY_JOBS) {
        try {
            // Always use the base CRON_SECRET: it validates for every scope,
            // even when this route was triggered with a scope-derived token.
            const response = await fetch(`${origin}/api/cron/${job}`, {
                headers: { authorization: `Bearer ${token}` },
                cache: "no-store",
            });
            let body: unknown;
            try {
                body = await response.json();
            } catch {
                body = undefined;
            }
            results[job] = { ok: response.ok, status: response.status, body };
            if (!response.ok) {
                logger.error("Daily cron job reported failure", undefined, {
                    job,
                    status: response.status,
                });
            }
        } catch (error) {
            // A dispatch failure (network, cold-start error) must not abort
            // the remaining jobs.
            logger.error("Daily cron job dispatch failed", error, { job });
            results[job] = { ok: false, error: (error as Error)?.message ?? "dispatch failed" };
        }
    }

    const failed = Object.entries(results)
        .filter(([, result]) => !result.ok)
        .map(([job]) => job);

    return NextResponse.json(
        {
            success: failed.length === 0,
            failed: failed.length > 0 ? failed : undefined,
            results,
        },
        { status: failed.length === 0 ? 200 : 500 },
    );
}

export { handleCron as GET, handleCron as POST };
