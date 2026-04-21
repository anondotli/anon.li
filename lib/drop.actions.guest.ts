/**
 * Guest-mode drop upload: hits /api/v1/drop/* directly (bypassing server
 * actions, which require a session). All state lives in-memory on the client;
 * the upload token is returned by createDrop once and echoed back via the
 * X-Upload-Token header on every subsequent call. No cookies are involved.
 */

import { UpgradeRequiredClientError } from "@/lib/drop.actions.client";
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils";

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

function isUpgradeErrorBody(body: unknown): body is { error: string; details?: { upgrade?: UpgradeRequiredDetails } } {
    return !!body && typeof body === "object" && "error" in (body as Record<string, unknown>);
}

async function handleErrorResponse(response: Response): Promise<never> {
    let body: unknown = null;
    try {
        body = await response.json();
    } catch {
        // non-JSON error
    }

    if (response.status === 402 || response.status === 413) {
        if (isUpgradeErrorBody(body) && body.details?.upgrade) {
            throw new UpgradeRequiredClientError(body.error, body.details.upgrade);
        }
    }

    // api-response wraps UpgradeRequiredError at any status with { error, details: { upgrade } }
    if (isUpgradeErrorBody(body) && body.details?.upgrade) {
        throw new UpgradeRequiredClientError(body.error, body.details.upgrade);
    }

    const message = isUpgradeErrorBody(body) ? body.error : `Request failed (${response.status})`;
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

    const body = await response.json() as {
        data?: { drop_id: string; expires_at: string | null; upload_token: string | null };
    };

    const data = body.data;
    if (!data || !data.upload_token) {
        throw new Error("Server did not return an upload token");
    }

    return {
        dropId: data.drop_id,
        expiresAt: data.expires_at,
        uploadToken: data.upload_token,
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

    return response.json() as Promise<GuestAddFileResult>;
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
