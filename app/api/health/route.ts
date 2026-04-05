import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { headBucket } from "@/lib/storage";
import { redis } from "@/lib/rate-limit";

type CheckState = "healthy" | "unhealthy" | "unknown";

/**
 * Health check endpoint for load balancers and monitoring.
 *
 * Liveness checks (cause 503 on failure):
 *   - Postgres        SELECT 1
 *   - B2              HeadBucket against configured bucket
 *   - Redis           PING (only when Upstash is configured)
 *
 * Metrics (informational, do not fail the check):
 *   - orphanCount         Count of OrphanedFile rows (storage GC backlog)
 *   - incompleteCount     Drops stuck in uploadComplete=false for >6h
 *   - softDeletedCount    Drops awaiting hard-delete
 *
 * Returns:
 *   200 — all liveness checks healthy
 *   503 — any liveness check failing
 */
export async function GET() {
    const sixHoursAgo = new Date(Date.now() - 6 * 60 * 60 * 1000);

    const checks = {
        database: "unknown" as CheckState,
        storage: "unknown" as CheckState,
        redis: "unknown" as CheckState,
    };

    const metrics: Record<string, number | null> = {
        orphanCount: null,
        incompleteCount: null,
        softDeletedCount: null,
    };

    const [dbResult, storageResult, redisResult, orphanResult, incompleteResult, softDeletedResult] = await Promise.allSettled([
        prisma.$queryRaw`SELECT 1`,
        headBucket(),
        redis ? redis.ping() : Promise.resolve("SKIP"),
        prisma.orphanedFile.count(),
        prisma.drop.count({ where: { uploadComplete: false, createdAt: { lt: sixHoursAgo } } }),
        prisma.drop.count({ where: { deletedAt: { not: null } } }),
    ]);

    checks.database = dbResult.status === "fulfilled" ? "healthy" : "unhealthy";
    checks.storage = storageResult.status === "fulfilled" ? "healthy" : "unhealthy";
    // Redis is "unknown" when not configured (dev), healthy when ping succeeds
    if (!redis) {
        checks.redis = "unknown";
    } else {
        checks.redis = redisResult.status === "fulfilled" ? "healthy" : "unhealthy";
    }

    if (orphanResult.status === "fulfilled") metrics.orphanCount = orphanResult.value;
    if (incompleteResult.status === "fulfilled") metrics.incompleteCount = incompleteResult.value;
    if (softDeletedResult.status === "fulfilled") metrics.softDeletedCount = softDeletedResult.value;

    const livenessFailed =
        checks.database === "unhealthy" ||
        checks.storage === "unhealthy" ||
        checks.redis === "unhealthy";

    const body = {
        status: livenessFailed ? "unhealthy" : "healthy",
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        checks,
        metrics,
    };

    return NextResponse.json(body, {
        status: livenessFailed ? 503 : 200,
        headers: {
            "Cache-Control": "no-store, no-cache, must-revalidate",
        },
    });
}

// Prevent caching
export const dynamic = "force-dynamic";
