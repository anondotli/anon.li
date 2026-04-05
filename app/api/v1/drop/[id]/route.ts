/**
 * GET /api/v1/drop/[id]
 * Get drop metadata and files for download
 *
 * DELETE /api/v1/drop/[id]
 * Delete a drop (owner only)
 *
 * PATCH /api/v1/drop/[id]?action=complete|toggle|finish
 * Complete a drop, toggle its disabled state, or batch finalize
 */

import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { DropService } from "@/lib/services/drop";
import { checkDropApiRateLimit, createRateLimitHeaders } from "@/lib/api-rate-limit";
import { getStatusCode } from "@/lib/api-error-utils";
import { generateRequestId, apiSuccess, apiErrorFromUnknown, withApiHeaders } from "@/lib/api-response";
import { validateCsrf } from "@/lib/csrf";
import { validateApiKey, hasExplicitApiKey } from "@/lib/api-auth";
import { createLogger } from "@/lib/logger";
import { getPublicDropMetadata } from "@/lib/drop-metadata";
import { z } from "zod";

const logger = createLogger("DropDetailAPI");

interface RouteParams {
    params: Promise<{ id: string }>;
}

const completeDropSchema = z.object({
    sessionToken: z.string().optional(),
});

const finishDropSchema = z.object({
    files: z.array(z.object({
        fileId: z.string().min(1),
        chunks: z.array(z.object({
            chunkIndex: z.number().int().min(0),
            etag: z.string().min(1),
        })).min(1).max(10000),
    })).min(1).max(100),
    sessionToken: z.string().optional(),
});

/**
 * Resolve the userId for actions that require authentication (delete, toggle).
 * Enforces CSRF for session-based requests and checks monthly quota.
 * Returns { userId } on success or { error: NextResponse } on failure.
 */
async function resolveAuthenticatedUser(
    request: Request
): Promise<{ userId: string; apiKeyResult?: Awaited<ReturnType<typeof validateApiKey>> } | { error: NextResponse }> {
    const apiKeyResult = await validateApiKey(request);

    if (apiKeyResult) {
        if (!apiKeyResult.rateLimit.success) {
            return { error: NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }) };
        }
        return { userId: apiKeyResult.user.id, apiKeyResult };
    }

    if (hasExplicitApiKey(request)) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    const session = await auth();
    if (!session?.user?.id) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }
    if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
        return { error: NextResponse.json({ error: "Two-factor authentication required" }, { status: 401 }) };
    }
    validateCsrf(request);
    const userId = session.user.id;

    const user = await prisma.user.findUnique({ where: { id: userId }, select: { stripePriceId: true, stripeCurrentPeriodEnd: true } });
    const quotaResult = await checkDropApiRateLimit(userId, user ?? { stripePriceId: null, stripeCurrentPeriodEnd: null });
    if (!quotaResult.success) {
        return { error: NextResponse.json({ error: "Monthly request limit exceeded" }, { status: 429, headers: Object.fromEntries(createRateLimitHeaders(quotaResult).entries()) }) };
    }

    return { userId };
}

/**
 * Resolve userId for upload-completion actions (complete, finish).
 * Authentication is optional — anonymous drops use session tokens.
 * Enforces CSRF when a session is present.
 * Returns { userId } on success or { error: NextResponse } on failure.
 */
async function resolveUploadUser(
    request: Request
): Promise<{ userId: string | null } | { error: NextResponse }> {
    const apiKeyResult = await validateApiKey(request);

    if (apiKeyResult) {
        if (!apiKeyResult.rateLimit.success) {
            return { error: NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 }) };
        }
        return { userId: apiKeyResult.user.id };
    }

    if (hasExplicitApiKey(request)) {
        return { error: NextResponse.json({ error: "Unauthorized" }, { status: 401 }) };
    }

    const session = await auth();
    if (session?.user?.twoFactorEnabled && !session?.twoFactorVerified) {
        return { error: NextResponse.json({ error: "Two-factor authentication required" }, { status: 401 }) };
    }
    if (session) {
        validateCsrf(request);
    }
    return { userId: session?.user?.id || null };
}

export async function GET(request: Request, { params }: RouteParams) {
    try {
        const { id: dropId } = await params;

        // Rate limiting for metadata requests (per-IP and per-dropId)
        const clientIp = await getClientIp();
        const rateLimited = await rateLimit("dropMetadata", clientIp);
        if (rateLimited) return rateLimited;

        const perDropLimited = await rateLimit("dropMetadataPerDrop", `${clientIp}:${dropId}`);
        if (perDropLimited) return perDropLimited;

        const drop = await getPublicDropMetadata(dropId);

        if (!drop) {
            return NextResponse.json({ error: "Drop not found" }, { status: 404 });
        }

        return NextResponse.json(drop);
    } catch (error) {
        logger.error("Drop fetch error", error);
        const requestId = generateRequestId();
        return apiErrorFromUnknown(error, requestId);
    }
}

export async function DELETE(request: Request, { params }: RouteParams) {
    try {
        const { id: dropId } = await params;

        const authResult = await resolveAuthenticatedUser(request);
        if ("error" in authResult) return authResult.error;
        const { userId } = authResult;

        const rateLimited = await rateLimit("dropOps", userId);
        if (rateLimited) return rateLimited;

        await DropService.deleteDrop(dropId, userId);

        return NextResponse.json({ success: true });
    } catch (error) {
        logger.error("Drop deletion error", error);
        const requestId = generateRequestId();
        return apiErrorFromUnknown(error, requestId);
    }
}

/**
 * PATCH /api/v1/drop/[id]?action=complete|toggle|finish
 * Complete a drop, toggle its disabled state, or batch finalize
 */
export async function PATCH(request: Request, { params }: RouteParams) {
    try {
        const { id: dropId } = await params;
        const url = new URL(request.url);
        const action = url.searchParams.get("action");

        if (action === "complete") {
            const authResult = await resolveUploadUser(request);
            if ("error" in authResult) return authResult.error;
            const { userId } = authResult;

            const identifier = userId || await getClientIp();
            const rateLimited = await rateLimit("dropOps", identifier);
            if (rateLimited) return rateLimited;

            const body = await request.json().catch(() => ({}));
            const validation = completeDropSchema.safeParse(body);

            if (!validation.success) {
                return NextResponse.json(
                    { error: "Invalid request body" },
                    { status: 400 }
                );
            }

            await DropService.completeDrop(dropId, userId, validation.data.sessionToken);
            return NextResponse.json({ success: true });

        } else if (action === "finish") {
            const authResult = await resolveUploadUser(request);
            if ("error" in authResult) return authResult.error;
            const { userId } = authResult;

            const identifier = userId || await getClientIp();
            const rateLimited = await rateLimit("dropOps", identifier);
            if (rateLimited) return rateLimited;

            const body = await request.json().catch(() => ({}));
            const validation = finishDropSchema.safeParse(body);

            if (!validation.success) {
                return NextResponse.json(
                    { error: "Invalid request body" },
                    { status: 400 }
                );
            }

            await DropService.finishDrop(dropId, validation.data.files, userId, validation.data.sessionToken);
            return NextResponse.json({ success: true });

        } else if (action === "toggle") {
            const authResult = await resolveAuthenticatedUser(request);
            if ("error" in authResult) return authResult.error;
            const { userId, apiKeyResult } = authResult;

            const rateLimited = await rateLimit("dropOps", userId);
            if (rateLimited) return rateLimited;

            const requestId = generateRequestId();
            const disabled = await DropService.toggleDrop(dropId, userId);

            const response = apiSuccess({ disabled }, requestId);
            if (apiKeyResult) {
                return withApiHeaders(response, requestId, createRateLimitHeaders(apiKeyResult.rateLimit));
            }
            return withApiHeaders(response, requestId);

        } else {
            return NextResponse.json(
                { error: "Invalid action. Use ?action=complete, ?action=toggle, or ?action=finish" },
                { status: 400 }
            );
        }
    } catch (error) {
        logger.error("Drop PATCH error", error);
        const status = getStatusCode(error);
        const message = status < 500 && error instanceof Error ? error.message : "Operation failed";
        return NextResponse.json({ error: message }, { status });
    }
}
