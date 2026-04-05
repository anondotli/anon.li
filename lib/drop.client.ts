/**
 * Client-side Drop API
 */

/**
 * File metadata for download
 */
export interface DropFile {
    id: string;
    encryptedName: string;
    size: string;
    mimeType: string;
    iv: string;
    chunkSize: number | null;
    chunkCount: number | null;
    downloadUrl?: string;
}

/**
 * Drop metadata returned from API for download page
 */
export interface DropMetadata {
    id: string;
    encryptedTitle: string | null;
    encryptedMessage: string | null;
    iv: string;
    customKey: boolean;
    salt: string | null;
    customKeyData: string | null;
    customKeyIv: string | null;
    downloads: number;
    maxDownloads: number | null;
    expiresAt: string | null;
    hideBranding: boolean;
    createdAt: string;
    files: DropFile[];
}

/** Maximum retry attempts for transient failures */
const MAX_RETRIES = 3;

/** Base delay for exponential backoff (ms) */
const RETRY_BASE_DELAY = 1000;

/**
 * Retry-enabled fetch wrapper with exponential backoff
 * Only retries on network errors and 5xx responses
 */
async function fetchWithRetry(
    url: string,
    options: RequestInit,
    retries = MAX_RETRIES
): Promise<Response> {
    let lastError: Error | null = null;
    
    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const res = await fetch(url, options);
            
            // Don't retry on client errors (4xx) - those are intentional
            if (res.status >= 400 && res.status < 500) {
                return res;
            }
            
            // Retry on server errors (5xx)
            if (res.status >= 500 && attempt < retries) {
                await delay(RETRY_BASE_DELAY * Math.pow(2, attempt));
                continue;
            }
            
            return res;
        } catch (error) {
            lastError = error instanceof Error ? error : new Error(String(error));
            
            // Don't retry if aborted
            if (lastError.name === 'AbortError') {
                throw lastError;
            }
            
            // Retry on network errors
            if (attempt < retries) {
                await delay(RETRY_BASE_DELAY * Math.pow(2, attempt));
                continue;
            }
        }
    }
    
    throw lastError || new Error('Request failed after retries');
}

function delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Upload a chunk directly to S3
 */
export async function uploadChunk(
    presignedUrl: string,
    chunk: ArrayBuffer,
    signal?: AbortSignal
): Promise<string> {
    let url = presignedUrl;
    const headers: Record<string, string> = {};

    // OPTIMIZATION: If this is our relay, move query params to header to shorten URL
    // This keeps logs clean and makes the network tab more readable
    if (url.includes("/relay/") && url.includes("?")) {
        const splitIndex = url.indexOf("?");
        const baseUrl = url.slice(0, splitIndex);
        const query = url.slice(splitIndex + 1);

        url = baseUrl;
        headers["X-Relay-Query"] = query;
    }

    const res = await fetchWithRetry(url, {
        method: "PUT",
        headers,
        body: chunk,
        signal,
        credentials: "omit", // Never send cookies to S3
    });

    if (!res.ok) {
        throw new Error("Failed to upload chunk");
    }

    return res.headers.get("ETag") || "";
}