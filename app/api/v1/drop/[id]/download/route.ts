/**
 * POST /api/v1/drop/[id]/download
 * Record a download and get signed URLs for all files
 */

import { NextResponse } from "next/server";
import { rateLimit, getClientIp } from "@/lib/rate-limit";
import { DropService } from "@/lib/services/drop";
import { getStatusCode } from "@/lib/api-error-utils";
import { getPresignedDownloadUrl } from "@/lib/storage";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const logger = createLogger("DropDownloadAPI");

interface RouteParams {
    params: Promise<{ id: string }>;
}

export async function POST(request: Request, { params }: RouteParams) {
    try {
        const { id: dropId } = await params;

        // Rate limiting - use dropDownload to prevent download abuse
        const clientIp = await getClientIp();
        const rateLimited = await rateLimit("dropDownload", clientIp);
        if (rateLimited) return rateLimited;

        // This is the legacy/batch download endpoint used by "Download All"
        // It increments the count once and returns signed URLs for all files
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: { files: { select: { id: true, storageKey: true } } },
        });

        if (!drop) return NextResponse.json({ error: "Drop not found" }, { status: 404 });

        if (drop.disabled || drop.takenDown || drop.deletedAt || !drop.uploadComplete) {
            return NextResponse.json({ error: "This drop is not available." }, { status: 404 });
        }

        if (drop.expiresAt && new Date() > drop.expiresAt) {
            return NextResponse.json({ error: "This drop has expired." }, { status: 404 });
        }

        if (drop.maxDownloads) {
            const counted = await DropService.incrementDownloadCount(dropId);
            if (!counted) {
                return NextResponse.json({ error: "Download limit reached." }, { status: 404 });
            }
        } else {
            await DropService.incrementDownloadCount(dropId);
        }

        const downloadUrls: Record<string, string> = {};
        for (const file of drop.files) {
            downloadUrls[file.id] = await getPresignedDownloadUrl(file.storageKey);
        }

        return NextResponse.json({ success: true, downloadUrls });
    } catch (error) {
        logger.error("Download recording error", error);
        const status = getStatusCode(error);
        const message = status < 500 && error instanceof Error ? error.message : "Failed to record download";
        return NextResponse.json({ error: message }, { status });
    }
}
