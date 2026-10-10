import { NextRequest, NextResponse } from "next/server";
import { validateCronAuth } from "@/lib/cron-auth";
import { createLogger } from "@/lib/logger";

const logger = createLogger("CronDaily");

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Daily workloads dispatched by this aggregator.
 *
 * Vercel Hobby allows at most three cron entries, so the per-job schedules
 * are consolidated here. Each job is invoked as an internal HTTP call to its
 * own dedicated route, which keeps the reliability model intact: every job
 * still runs in its own function invocation with its own auth scope, Redis
 * lock, maxDuration budget, and error reporting, so one slow or failing
 * workload cannot consume another's function budget.
 *
 * Jobs are dispatched concurrently: awaited one after another, their combined
 * runtime could exceed this route's own 300-second budget and the later jobs
 * would silently never be dispatched. Each dispatch is bounded by
 * JOB_TIMEOUT_MS so the aggregator always reports per-job results before its
 * own deadline; a timed-out job keeps running in its own invocation. Jobs
 * that write the same rows (drop deletion in billing and cleanup) already
 * claim them atomically.
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

/** Leaves headroom inside this route's 300-second maxDuration to respond. */
const JOB_TIMEOUT_MS = 270_000;

function withScheme(host: string): string {
    return /^https?:\/\//.test(host) ? host : `https://${host}`;
}

function getDispatchOrigin(): string {
    // Never derive the destination from req.url / Host while attaching the base
    // CRON_SECRET: a forged host could otherwise exfiltrate the credential.
    //
    // In production, dispatch to the canonical public URL. VERCEL_URL is the
    // per-deployment hostname, which Vercel Deployment Protection guards, so
    // sub-job requests to it are rejected (401) before reaching the routes.
    // Preview deployments keep using their own VERCEL_URL so a preview never
    // dispatches jobs (and its secret) to production. Self-hosted/local
    // installs use the required canonical application URL.
    const isVercelProduction = process.env.VERCEL_ENV === "production";
    const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const deploymentHost = process.env.VERCEL_URL;
    const configuredUrl = isVercelProduction
        ? (process.env.NEXT_PUBLIC_APP_URL || (productionHost ? withScheme(productionHost) : undefined))
        : (deploymentHost ? withScheme(deploymentHost) : process.env.NEXT_PUBLIC_APP_URL);

    if (!configuredUrl) {
        throw new Error("No trusted cron dispatch origin is configured");
    }

    return new URL(configuredUrl).origin;
}

async function dispatchJob(origin: string, job: string, token: string): Promise<JobResult> {
    try {
        // Always use the base CRON_SECRET: it validates for every scope,
        // even when this route was triggered with a scope-derived token.
        const response = await fetch(`${origin}/api/cron/${job}`, {
            headers: { authorization: `Bearer ${token}` },
            cache: "no-store",
            signal: AbortSignal.timeout(JOB_TIMEOUT_MS),
        });
        let body: unknown;
        try {
            body = await response.json();
        } catch {
            body = undefined;
        }
        if (!response.ok) {
            logger.error("Daily cron job reported failure", undefined, {
                job,
                status: response.status,
            });
        }
        return { ok: response.ok, status: response.status, body };
    } catch (error) {
        // A dispatch failure (network, cold-start error, timeout) must not
        // affect the other jobs.
        const timedOut = error instanceof Error && error.name === "TimeoutError";
        logger.error(timedOut ? "Daily cron job timed out" : "Daily cron job dispatch failed", error, { job });
        return {
            ok: false,
            error: timedOut
                ? `timed out after ${JOB_TIMEOUT_MS / 1000}s`
                : (error as Error)?.message ?? "dispatch failed",
        };
    }
}

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

    let origin: string;
    try {
        origin = getDispatchOrigin();
    } catch (error) {
        logger.error("Unable to resolve trusted daily cron dispatch origin", error);
        return new NextResponse("Internal Server Error", { status: 500 });
    }
    const settled = await Promise.all(
        DAILY_JOBS.map(async (job) => [job, await dispatchJob(origin, job, token)] as const),
    );
    const results: Record<string, JobResult> = Object.fromEntries(settled);

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
