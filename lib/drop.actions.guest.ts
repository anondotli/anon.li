/**
 * Guest-mode drop upload: hits /api/v1/drop/* directly (bypassing server
 * actions, which require a session). All state lives in-memory on the client;
 * the upload token is returned by createDrop once and echoed back via the
 * X-Upload-Token header on every subsequent call. No cookies are involved.
 */

import { UpgradeRequiredClientError } from "@/lib/drop.actions.client";
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils";
import {
    parseProvisionedFileResponse,
    parseUploadTargetResponse,
} from "@/lib/drop-upload-response.client";

interface GuestCreateDropInput {
    iv: string;
    encryptedTitle?: string;
    encryptedMessage?: string;
    expiry?: number;
    maxDownloads?: number;
    customKey?: boolean;
    salt?: string;
    customKeyData?: string;
    customKeyIv?: string;
    hideBranding?: boolean;
    notifyOnDownload?: boolean;
    fileCount?: number;
    turnstileToken?: string;
}

interface GuestCreateDropResult {
    dropId: string;
    expiresAt: string | null;
    uploadToken: string;
}

interface GuestAddFileInput {
    size: number;
    encryptedName: string;
    iv: string;
    mimeType: string;
    chunkCount: number;
    chunkSize: number;
}

interface GuestAddFileResult {
    fileId: string;
    s3UploadId: string;
    uploadUrls: Record<number, string>;
}

function isUpgradeDetails(value: unknown): value is UpgradeRequiredDetails {
    if (!value || typeof value !== "object") return false;
    const details = value as Record<string, unknown>;
    return typeof details.scope === "string"
        && ["guest", "free", "plus", "pro"].includes(String(details.currentTier))
        && ["plus", "pro"].includes(String(details.suggestedTier));
}

function parseErrorBody(body: unknown): { message: string; upgrade?: UpgradeRequiredDetails } | null {
    if (!body || typeof body !== "object") return null;
    const record = body as Record<string, unknown>;
    const error = record.error;
    if (typeof error === "string") {
        const legacyDetails = record.details;
        const legacyUpgrade = legacyDetails && typeof legacyDetails === "object"
            ? (legacyDetails as Record<string, unknown>).upgrade
            : null;
        return {
            message: error,
            ...(isUpgradeDetails(legacyUpgrade) ? { upgrade: legacyUpgrade } : {}),
        };
    }
    if (!error || typeof error !== "object") return null;
    const apiError = error as Record<string, unknown>;
    if (typeof apiError.message !== "string") return null;
    const details = apiError.details;
    const upgrade = details && typeof details === "object" && !Array.isArray(details)
        ? (details as Record<string, unknown>).upgrade
        : null;
    return {
        message: apiError.message,
        ...(isUpgradeDetails(upgrade) ? { upgrade } : {}),
    };
}

async function handleErrorResponse(response: Response): Promise<never> {
    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        // non-JSON error
    }

    const parsed = parseErrorBody(body);
    if (parsed?.upgrade) {
        throw new UpgradeRequiredClientError(parsed.message, parsed.upgrade);
    }

    const message = parsed?.message ?? `Request failed (${response.status})`;
    throw new Error(message);
}

export async function createGuestDrop(
    input: GuestCreateDropInput,
    signal?: AbortSignal,
): Promise<GuestCreateDropResult> {
    if (signal?.aborted) throw new Error("Upload cancelled");

    const response = await fetch("/api/v1/drop", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "omit",
        body: JSON.stringify(input),
        signal,
    });

    if (!response.ok) return handleErrorResponse(response);

    const body: unknown = await response.json().catch(() => null);
    const data = parseUploadTargetResponse(body);

    return {
        dropId: data.dropId,
        expiresAt: data.expiresAt,
        uploadToken: data.uploadToken,
    };
}

export async function addFileToGuestDrop(
    dropId: string,
    input: GuestAddFileInput,
    uploadToken: string,
    signal?: AbortSignal,
): Promise<GuestAddFileResult> {
    if (signal?.aborted) throw new Error("Upload cancelled");

    const response = await fetch(`/api/v1/drop/${dropId}/file`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-Upload-Token": uploadToken,
        },
        credentials: "omit",
        body: JSON.stringify(input),
        signal,
    });

    if (!response.ok) return handleErrorResponse(response);

    const body: unknown = await response.json().catch(() => null);
    return parseProvisionedFileResponse(body, input.chunkCount);
}

export async function finishGuestDrop(
    dropId: string,
    files: { fileId: string; chunks: { chunkIndex: number; etag: string }[] }[],
    uploadToken: string,
    signal?: AbortSignal,
): Promise<void> {
    if (signal?.aborted) throw new Error("Upload cancelled");

    const response = await fetch(`/api/v1/drop/${dropId}?action=finish`, {
        method: "PATCH",
        headers: {
            "Content-Type": "application/json",
            "X-Upload-Token": uploadToken,
        },
        credentials: "omit",
        body: JSON.stringify({ files }),
        signal,
    });

    if (!response.ok) return handleErrorResponse(response);
}

export async function abortGuestFileUpload(
    dropId: string,
    fileId: string,
    s3UploadId: string,
    uploadToken: string,
): Promise<void> {
    await fetch(`/api/v1/drop/${dropId}/file/${fileId}`, {
        method: "DELETE",
        headers: {
            "Content-Type": "application/json",
            "X-Upload-Token": uploadToken,
        },
        credentials: "omit",
        body: JSON.stringify({ s3UploadId }),
    }).catch(() => {
        // Best-effort cleanup only.
    });
}
