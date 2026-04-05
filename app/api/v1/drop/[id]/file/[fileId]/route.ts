/**
 * GET /api/v1/drop/[id]/file/[fileId]
 * Validate access and redirect to a presigned R2 download URL.
 * Blob bytes never touch our servers.
 *
 * DELETE /api/v1/drop/[id]/file/[fileId]
 * Abort a multipart upload (merged from file/[fileId]/abort)
 */

import { NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { DropService } from "@/lib/services/drop";
import { decrementStorageUsed } from "@/lib/services/drop-storage";
import { getPresignedDownloadUrl, abortMultipartUpload } from "@/lib/storage";
import { getStatusCode } from "@/lib/api-error-utils";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { checkDropApiRateLimit, createRateLimitHeaders } from "@/lib/api-rate-limit";
import { validateApiKey, hasExplicitApiKey } from "@/lib/api-auth";
import { validateCsrf } from "@/lib/csrf";
import { verifyDropSession } from "@/lib/drop-utils";
import { z } from "zod";
import { createLogger } from "@/lib/logger";

const logger = createLogger("FileAPI");

interface RouteParams {
    params: Promise<{
        id: string;
        fileId: string;
    }>;
}

export const dynamic = 'force-dynamic';

const abortSchema = z.object({
    s3UploadId: z.string(),
    sessionToken: z.string().optional(),
});

/**
 * GET - Validate access and 302 redirect to a presigned R2 URL.
 *
 * Vercel only serves the redirect (a few hundred bytes); the client then
 * fetches bytes directly from R2 via the custom domain, with native Range
 * support. This is the hot path for large-file downloads.
 *
 * Download counting: we increment once per redirect issued, matching the
 * semantics of the batch-download flow in actions/drop.ts. Clients that
 * resume via Range *after* re-hitting this endpoint would count twice, but
 * in practice the browser follows the 302 to the presigned URL and reuses
 * that target for resumption, so the common case is correct.
 *
 * Preview mode (`?preview=1`) does not count toward the download limit.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
    try {
        const { id: dropId, fileId } = await params;

        // Rate limiting
        const clientIp = await getClientIp();
        const rateLimited = await rateLimit("download", clientIp);
        if (rateLimited) return rateLimited;

        // Validate Drop & File
        const file = await prisma.dropFile.findUnique({
            where: { id: fileId },
            include: {
                drop: {
                    select: {
                        id: true,
                        expiresAt: true,
                        maxDownloads: true,
                        downloads: true,
                        deletedAt: true,
                        disabled: true,
                        uploadComplete: true,
                        takenDown: true,
                        customKey: true,
                    }
                }
            }
        });

        if (!file) {
            return new NextResponse("This file is not available.", { status: 404 });
        }

        if (file.drop.id !== dropId) {
            return new NextResponse("This file is not available.", { status: 404 });
        }

        if (file.drop.deletedAt) {
            return new NextResponse("This file is not available.", { status: 404 });
        }

        if (file.drop.takenDown) {
            return new NextResponse("This content has been removed.", { status: 451 });
        }

        if (file.drop.disabled) {
            return new NextResponse("This file is not available.", { status: 404 });
        }

        if (!file.drop.uploadComplete) {
            return new NextResponse("This file is not available.", { status: 404 });
        }

        if (file.drop.expiresAt && new Date() > file.drop.expiresAt) {
            return new NextResponse("This file is not available.", { status: 404 });
        }

        if (file.drop.maxDownloads && file.drop.downloads >= file.drop.maxDownloads) {
            return new NextResponse("This file is not available.", { status: 404 });
        }

        const isPreview = request.nextUrl.searchParams.get("preview") === "1";
        const rangeHeader = request.headers.get("Range");
        // Only count a download on the initial request (no Range header, or a
        // full-file open-ended range). Range resumption requests don't re-count.
        const isNewDownload = !rangeHeader || rangeHeader === "bytes=0-";

        // Count download BEFORE issuing the redirect. On the final allowed
        // download, incrementDownloadCount soft-deletes the drop but leaves
        // storage objects in place for the ~1h presigned URL lifetime.
        if (isNewDownload && !isPreview) {
            const counted = await DropService.incrementDownloadCount(dropId);
            if (!counted) {
                return new NextResponse("Download limit reached.", { status: 404 });
            }
        }

        const presignedUrl = await getPresignedDownloadUrl(file.storageKey);

        // 302 redirect — Vercel only emits the Location header, bytes flow
        // directly from R2 to the client.
        return NextResponse.redirect(presignedUrl, {
            status: 302,
            headers: {
                "Cache-Control": "no-store, no-cache, must-revalidate",
            },
        });

    } catch (error) {
        logger.error("Download error", error);
        const status = getStatusCode(error);
        const message = status < 500 && error instanceof Error ? error.message : "Failed to download file";
        return NextResponse.json({ error: message }, { status });
    }
}

/**
 * DELETE - Abort a multipart upload
 */
export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const { id: dropId, fileId } = await params;

        // Try API key first, then fall back to session
        const apiKeyResult = await validateApiKey(request);
        let userId: string | null = null;

        if (apiKeyResult) {
            if (!apiKeyResult.rateLimit.success) {
                return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
            }
            userId = apiKeyResult.user.id;
        } else if (hasExplicitApiKey(request)) {
            // Explicit ak_ key was supplied but invalid — reject rather than silently using session
            return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        } else {
            const session = await auth();
            if (session?.user?.twoFactorEnabled && !session?.twoFactorVerified) {
                return NextResponse.json({ error: "Two-factor authentication required" }, { status: 401 });
            }
            if (session?.user?.id) {
                validateCsrf(request);
                userId = session.user.id;

                // Monthly quota check for session-authenticated requests
                const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripePriceId: true, stripeCurrentPeriodEnd: true } });
                const quotaResult = await checkDropApiRateLimit(userId, user ?? { stripePriceId: null, stripeCurrentPeriodEnd: null });
                if (!quotaResult.success) {
                    return NextResponse.json({ error: "Monthly request limit exceeded" }, { status: 429, headers: Object.fromEntries(createRateLimitHeaders(quotaResult).entries()) });
                }
            }
        }

        // Rate limit check
        const identifier = userId || await getClientIp();
        const rateLimited = await rateLimit("dropOps", identifier);
        if (rateLimited) return rateLimited;

        const body = await request.json().catch(() => ({}));
        const validation = abortSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: "Invalid request body" },
                { status: 400 }
            );
        }

        const { s3UploadId, sessionToken } = validation.data;

        const file = await prisma.dropFile.findUnique({
            where: { id: fileId },
            include: { drop: true },
        });

        if (!file) {
            // File already deleted or doesn't exist - that's fine
            return NextResponse.json({ success: true });
        }

        // Ensure s3UploadId belongs to the specified file record
        if (file && file.s3UploadId && s3UploadId !== file.s3UploadId) {
            return NextResponse.json({ error: "Unauthorized upload ID" }, { status: 401 });
        }

        // Verify ownership
        if (file.drop.userId) {
            if (!userId || file.drop.userId !== userId) {
                return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
            }
        } else {
            // Anonymous drop - verify session token
            if (!sessionToken) {
                return NextResponse.json(
                    { error: "Session token required" },
                    { status: 401 }
                );
            }
            const valid = await verifyDropSession(dropId, sessionToken);
            if (!valid) {
                return NextResponse.json(
                    { error: "Invalid session token" },
                    { status: 401 }
                );
            }
        }

        // Abort the multipart upload in S3
        try {
            await abortMultipartUpload(file.storageKey, s3UploadId);
        } catch {
            logger.warn("Failed to abort multipart upload", { s3UploadId });
        }

        // Capture quota info before deleting
        const fileSize = file.size;
        const fileUserId = file.drop.userId;

        // Delete the file record
        await prisma.dropFile.delete({
            where: { id: fileId },
        }).catch(() => {
            // Ignore if already deleted
        });

        // Reclaim reserved quota
        if (fileUserId && fileSize > BigInt(0)) {
            try {
                await decrementStorageUsed(fileUserId, fileSize);
            } catch (e) {
                logger.error("Failed to decrement storageUsed on abort", e, { fileId });
            }
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Abort upload error", error);
        // Always return success - cleanup is best effort
        return NextResponse.json({ success: true });
    }
}
