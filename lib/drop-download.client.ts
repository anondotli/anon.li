"use client"

interface AuthorizedDropFileOptions {
    recipientToken?: string | null
    preview?: boolean
    signal?: AbortSignal
}

async function readDownloadError(response: Response): Promise<string> {
    const body = await response.text()
    try {
        const parsed = JSON.parse(body) as { error?: unknown }
        return typeof parsed.error === "string" ? parsed.error : "Failed to download file"
    } catch {
        return body || "Failed to download file"
    }
}

/**
 * Authorize against anon.li first, then fetch R2 in a clean request. Keeping
 * those as two requests prevents the recipient access token from following a
 * cross-origin redirect into storage-provider headers/logs.
 */
export async function fetchAuthorizedDropFile(
    dropId: string,
    fileId: string,
    options: AuthorizedDropFileOptions = {},
): Promise<Response> {
    const query = options.preview ? "?preview=1" : ""
    const authorization = await fetch(`/api/v1/drop/${dropId}/file/${fileId}${query}`, {
        headers: {
            Accept: "application/json",
            ...(options.recipientToken ? { "X-Drop-Recipient": options.recipientToken } : {}),
        },
        credentials: "same-origin",
        redirect: "error",
        signal: options.signal,
    })

    if (!authorization.ok) {
        throw new Error(await readDownloadError(authorization))
    }

    const payload = await authorization.json() as { url?: unknown }
    if (typeof payload.url !== "string" || !/^https:\/\//i.test(payload.url)) {
        throw new Error("Invalid download authorization response")
    }

    return fetch(payload.url, {
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: options.signal,
    })
}
