import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"

const logger = createLogger("HealthCheck")

/**
 * Health check endpoint for the internal mail server API
 * GET /api/internal/health
 * 
 * Returns OK if the API is working and database is reachable.
 * Does NOT require authentication (used for monitoring).
 */
export async function GET() {
    try {
        // Quick database connectivity check
        await prisma.$queryRaw`SELECT 1`
        
        return NextResponse.json({
            status: "ok",
            timestamp: new Date().toISOString(),
            service: "anon.li-api",
        })
    } catch (error) {
        logger.error("Health check failed", error)
        
        return NextResponse.json({
            status: "error",
            timestamp: new Date().toISOString(),
            service: "anon.li-api",
            error: "Database connection failed",
        }, { status: 503 })
    }
}