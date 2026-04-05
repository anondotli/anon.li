/**
 * POST /api/v1/drop/[id]/file
 * Add a file to an existing drop
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { DropService } from "@/lib/services/drop";
import { getStatusCode } from "@/lib/api-error-utils";
import { getChunkPresignedUrls } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { validateApiKey, hasExplicitApiKey } from "@/lib/api-auth";
import { checkDropApiRateLimit, createRateLimitHeaders } from "@/lib/api-rate-limit";
import { getDropLimits } from "@/lib/limits";
import { createLogger } from "@/lib/logger";
import { addFileApiSchema } from "@/lib/validations/drop";

const logger = createLogger("DropFileAPI");

interface RouteParams {
    params: Promise<{ id: string }>;
}

// addFileApiSchema imported from @/lib/validations/drop
const addFileSchema = addFileApiSchema;

export async function POST(request: Request, { params }: RouteParams) {
    try {
        const { id: dropId } = await params;

        // Try API key first, then fall back to session
        const apiKeyResult = await validateApiKey(request);
        let userId: string | null = null;
        let rateLimitHeaders: Headers | null = null;

        if (apiKeyResult) {
            userId = apiKeyResult.user.id;
            rateLimitHeaders = createRateLimitHeaders(apiKeyResult.rateLimit);
            if (!apiKeyResult.rateLimit.success) {
                return NextResponse.json(
                    {
                        error: "Rate limit exceeded",
                        message: "You have exceeded your monthly API request limit.",
                        reset: apiKeyResult.rateLimit.reset.toISOString(),
                    },
                    {
                        status: 429,
                        headers: Object.fromEntries(rateLimitHeaders.entries()),
                    }
                );
            }
        } else if (hasExplicitApiKey(request)) {
            // Explicit ak_ key was supplied but invalid — reject rather than silently using session
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        } else {
            const session = await auth();
            if (session?.user?.twoFactorEnabled && !session?.twoFactorVerified) {
                return NextResponse.json({ error: "Two-factor authentication required" }, { status: 401 });
            }
            userId = session?.user?.id || null;
        }

        // Rate limiting
        const clientIp = await getClientIp();
        const identifier = userId || clientIp;
        const rateLimitType = userId ? "fileUploadAuth" : "fileUpload";
        const rateLimited = await rateLimit(rateLimitType, identifier);
        if (rateLimited) return rateLimited;

        // Check monthly API quota for session-based authenticated users
        let user: { stripePriceId: string | null; stripeCurrentPeriodEnd: Date | null; storageUsed: bigint } | null = null;

        if (userId && !apiKeyResult) {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select: { stripePriceId: true, stripeCurrentPeriodEnd: true, storageUsed: true },
            });
            const quotaResult = await checkDropApiRateLimit(userId, user ?? { stripePriceId: null });
            rateLimitHeaders = createRateLimitHeaders(quotaResult);

            if (!quotaResult.success) {
                return NextResponse.json(
                    {
                        error: "Rate limit exceeded",
                        message: "You have exceeded your monthly API request limit.",
                        reset: quotaResult.reset.toISOString(),
                    },
                    {
                        status: 429,
                        headers: Object.fromEntries(rateLimitHeaders.entries()),
                    }
                );
            }
        } else if (userId && apiKeyResult) {
            user = await prisma.user.findUnique({
                where: { id: userId },
                select: { stripePriceId: true, stripeCurrentPeriodEnd: true, storageUsed: true },
            });
        }

        const body = await request.json();

        const validation = addFileSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 }
            );
        }

        // Check storage quota before adding file
        if (userId && user) {
            const limits = getDropLimits(user);
            const storageUsed = user.storageUsed || BigInt(0);
            const storageLimit = BigInt(limits.maxStorage);
            const newTotal = storageUsed + BigInt(validation.data.size);

            if (newTotal > storageLimit) {
                const responseHeaders: Record<string, string> = {};
                if (rateLimitHeaders) {
                    for (const [key, value] of rateLimitHeaders.entries()) {
                        responseHeaders[key] = value;
                    }
                }
                return NextResponse.json(
                    {
                        error: "Storage quota exceeded",
                        code: "QUOTA_EXCEEDED",
                        storage: {
                            used: storageUsed.toString(),
                            limit: storageLimit.toString(),
                        },
                    },
                    { status: 402, headers: responseHeaders }
                );
            }
        }

        const result = await DropService.addFile(userId, {
            dropId,
            ...validation.data,
        });

        // Generate presigned URLs for chunk uploads
        const partNumbers = Array.from(
            { length: validation.data.chunkCount },
            (_, i) => i + 1
        );
        const uploadUrls = await getChunkPresignedUrls(
            result.storageKey,
            result.s3UploadId,
            partNumbers
        );

        const responseData = {
            fileId: result.fileId,
            s3UploadId: result.s3UploadId,
            uploadUrls,
        };

        if (rateLimitHeaders) {
            return NextResponse.json(responseData, {
                headers: Object.fromEntries(rateLimitHeaders.entries()),
            });
        }

        return NextResponse.json(responseData);
    } catch (error) {
        logger.error("Add file error", error);
        const status = getStatusCode(error);
        const message = status < 500 && error instanceof Error ? error.message : "Failed to add file";
        return NextResponse.json({ error: message }, { status });
    }
}
