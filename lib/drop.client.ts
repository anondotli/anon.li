/**
 * Client-side Drop API
 */

/**
 * File metadata for download
 */
interface DropFile {
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
            
            // R2 can transiently throttle multipart writes. Retry the standard
            // timeout/throttling statuses as well as server failures; other 4xx
            // responses indicate an invalid or expired presigned request.
            const retryable = res.status === 408
                || res.status === 425
                || res.status === 429
                || res.status >= 500;
            if (retryable && attempt < retries) {
                await delay(retryDelayMs(res, attempt), options.signal);
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
                await delay(RETRY_BASE_DELAY * Math.pow(2, attempt), options.signal);
                continue;
            }
        }
    }
    
    throw lastError || new Error('Request failed after retries');
}

function retryDelayMs(response: Response, attempt: number): number {
    const retryAfter = response.headers.get("Retry-After");
    if (retryAfter) {
        const seconds = Number(retryAfter);
        if (Number.isFinite(seconds) && seconds >= 0) {
            return Math.min(seconds * 1000, 30_000);
        }

        const date = Date.parse(retryAfter);
        if (Number.isFinite(date)) {
            return Math.min(Math.max(0, date - Date.now()), 30_000);
        }
    }

    return RETRY_BASE_DELAY * Math.pow(2, attempt);
}

function delay(ms: number, signal?: AbortSignal | null): Promise<void> {
    if (signal?.aborted) {
        return Promise.reject(signal.reason ?? new DOMException("Upload cancelled", "AbortError"));
    }

    return new Promise((resolve, reject) => {
        const timeout = setTimeout(() => {
            signal?.removeEventListener("abort", onAbort);
            resolve();
        }, ms);
        const onAbort = () => {
            clearTimeout(timeout);
            signal?.removeEventListener("abort", onAbort);
            reject(signal?.reason ?? new DOMException("Upload cancelled", "AbortError"));
        };
        signal?.addEventListener("abort", onAbort, { once: true });
    });
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

    const etag = res.headers.get("ETag");
    if (!etag) {
        throw new Error(
            "Upload succeeded, but storage did not expose its ETag. Check the R2 bucket CORS policy.",
        );
    }

    return etag;
}
