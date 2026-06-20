import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { redis } from "@/lib/rate-limit"

// Deep readiness probe. Unlike /api/health (a static "ok" liveness check), this
// runs per request and verifies the app can actually reach its critical
// dependencies — Postgres and Redis. It returns 503 when a dependency is down so
// an uptime monitor / load balancer can tell "process is alive" apart from
// "process can actually serve traffic". Intentionally unauthenticated (monitors
// hit it without secrets); the body is minimal and leaks nothing sensitive.
export const dynamic = "force-dynamic"
export const revalidate = 0

async function checkDatabase(): Promise<boolean> {
    try {
        await prisma.$queryRaw`SELECT 1`
        return true
    } catch {
        return false
    }
}

async function checkRedis(): Promise<boolean> {
    try {
        await redis.get("health:ready")
        return true
    } catch {
        return false
    }
}

export async function GET() {
    const [database, redisOk] = await Promise.all([checkDatabase(), checkRedis()])

    const healthy = database && redisOk

    return NextResponse.json(
        {
            status: healthy ? "ok" : "degraded",
            checks: {
                database: database ? "ok" : "down",
                redis: redisOk ? "ok" : "down",
            },
            timestamp: new Date().toISOString(),
        },
        {
            status: healthy ? 200 : 503,
            headers: { "cache-control": "no-store" },
        },
    )
}
