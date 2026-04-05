import { prisma } from "@/lib/prisma"
import { NextResponse } from "next/server"
import crypto from "crypto"
import { validateInternalApiSecret, isInternalRateLimited } from "@/lib/internal-api-auth"
import { createLogger } from "@/lib/logger"

const logger = createLogger("InternalDomainsAPI");
export const dynamic = 'force-dynamic'

// Base domains that are always included
const BASE_DOMAINS = ["anon.li", "reply.anon.li"]

/**
 * Generate a checksum for domain list integrity verification
 */
function generateChecksum(domains: string[]): string {
    const sorted = [...domains].sort()
    const hash = crypto.createHash("sha256")
        .update(sorted.join("\n"))
        .digest("hex")
    return `sha256:${hash.substring(0, 16)}`
}

/**
 * Generate ETag for cache validation
 */
function generateETag(domains: string[], timestamp: Date): string {
    const hash = crypto.createHash("md5")
        .update(domains.sort().join(",") + timestamp.getTime())
        .digest("hex")
    return `"${hash.substring(0, 16)}"`
}

export async function GET(req: Request) {
    const startTime = Date.now()

    if (!validateInternalApiSecret(req)) {
        logger.warn("Unauthorized request");
        return NextResponse.json(
            { error: "Unauthorized" },
            {
                status: 401,
                headers: {
                    "X-Request-Duration-Ms": String(Date.now() - startTime)
                }
            }
        )
    }

    if (await isInternalRateLimited("domains")) {
        return NextResponse.json(
            { error: "Too many requests" },
            {
                status: 429,
                headers: {
                    "X-Request-Duration-Ms": String(Date.now() - startTime)
                }
            }
        )
    }

    try {
        const domains = await prisma.domain.findMany({
            where: {
                verified: true,
                userId: { not: null }
            },
            select: {
                domain: true,
                updatedAt: true
            },
            orderBy: {
                domain: 'asc'
            }
        }) as unknown as Array<{ domain: string; updatedAt: Date }>

        // Extract just the domain names and normalize
        const domainList = domains
            .map(d => d.domain.toLowerCase().trim())
            .filter(d => d.length > 0 && d.includes('.'))

        // Merge with base domains (deduplicated)
        const allDomains = [...new Set([...BASE_DOMAINS, ...domainList])].sort()

        const lastUpdated = domains.length > 0 
            ? new Date(Math.max(...domains.map(d => d.updatedAt.getTime())))
            : new Date()

        // Generate cache headers
        const etag = generateETag(allDomains, lastUpdated)
        const checksum = generateChecksum(allDomains)
        const generatedAt = new Date().toISOString()

        // Check If-None-Match for conditional requests
        const ifNoneMatch = req.headers.get("if-none-match")
        if (ifNoneMatch === etag) {
            return new NextResponse(null, {
                status: 304,
                headers: {
                    "ETag": etag,
                    "X-Domains-Count": String(allDomains.length),
                    "X-Request-Duration-Ms": String(Date.now() - startTime)
                }
            })
        }

        // Build response
        const response = {
            domains: allDomains,
            count: allDomains.length,
            checksum: checksum,
            generatedAt: generatedAt,
            // Include metadata for debugging/monitoring
            meta: {
                baseDomains: BASE_DOMAINS.length,
                customDomains: allDomains.length - BASE_DOMAINS.length,
                lastDomainUpdate: lastUpdated.toISOString()
            }
        }

        logger.info(`Returning domains`, { total: allDomains.length, custom: domains.length });

        return NextResponse.json(response, {
            status: 200,
            headers: {
                "ETag": etag,
                "Cache-Control": "private, max-age=60, stale-while-revalidate=300",
                "X-Domains-Count": String(allDomains.length),
                "X-Domains-Checksum": checksum,
                "X-Request-Duration-Ms": String(Date.now() - startTime)
            }
        })

    } catch (error) {
        logger.error("Error fetching domains", error);
        
        // Return appropriate error based on type
        if (error instanceof Error) {
            // Prisma connection errors
            if (error.message.includes("connect") || error.message.includes("timeout")) {
                return NextResponse.json(
                    { error: "Database unavailable", code: "DB_ERROR" },
                    { 
                        status: 503,
                        headers: {
                            "Retry-After": "30",
                            "X-Request-Duration-Ms": String(Date.now() - startTime)
                        }
                    }
                )
            }
        }

        return NextResponse.json(
            { error: "Internal Server Error", code: "INTERNAL_ERROR" },
            { 
                status: 500,
                headers: {
                    "X-Request-Duration-Ms": String(Date.now() - startTime)
                }
            }
        )
    }
}