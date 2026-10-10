import {
    appendVaryHeader,
    buildMarkdownFetchHeaders,
    isMarkdownInternalPath,
    MARKDOWN_REWRITE_HEADER,
} from "@/lib/markdown-negotiation"
import { renderMarkdownDocument } from "@/lib/markdown-render"

// Served at /__markdown (the %5F escape keeps Next from treating the folder as
// a private `_` folder). Only reached via the proxy's Accept-based rewrite.
export const dynamic = "force-dynamic"

function resolveTarget(request: Request): URL | null {
    const requestUrl = new URL(request.url)
    const target = requestUrl.searchParams.get("target")
    if (!target || !target.startsWith("/") || target.startsWith("//")) return null

    let targetUrl: URL
    try {
        targetUrl = new URL(target, requestUrl)
    } catch {
        return null
    }

    // `/\host` and similar parse to a different origin; only same-origin pages
    // may be converted, and never the converter itself.
    if (targetUrl.origin !== requestUrl.origin) return null
    if (isMarkdownInternalPath(targetUrl.pathname)) return null

    return targetUrl
}

export async function GET(request: Request) {
    const responseHeaders = new Headers()
    appendVaryHeader(responseHeaders, "Accept")
    // Direct hits on the internal path must never be indexed; the negotiated
    // markdown served at the public URL (marked by the proxy) is unaffected.
    if (request.headers.get(MARKDOWN_REWRITE_HEADER) !== "1") {
        responseHeaders.set("X-Robots-Tag", "noindex, nofollow")
    }

    const targetUrl = resolveTarget(request)
    if (!targetUrl) {
        responseHeaders.set("Content-Type", "text/plain; charset=utf-8")

        return new Response("Missing or invalid markdown target.", {
            status: 400,
            headers: responseHeaders,
        })
    }

    const htmlResponse = await fetch(targetUrl, {
        headers: buildMarkdownFetchHeaders(request.headers),
    })

    const htmlContentType = htmlResponse.headers.get("content-type") ?? ""

    const cacheControl = htmlResponse.headers.get("cache-control")
    if (cacheControl) {
        responseHeaders.set("Cache-Control", cacheControl)
    }

    if (!htmlContentType.includes("text/html")) {
        responseHeaders.set("Content-Type", "text/plain; charset=utf-8")

        return new Response("Markdown negotiation is only available for HTML responses.", {
            status: 406,
            headers: responseHeaders,
        })
    }

    const html = await htmlResponse.text()
    const { markdown, tokens } = renderMarkdownDocument(html, targetUrl.toString())

    responseHeaders.set("Content-Type", "text/markdown; charset=utf-8")
    responseHeaders.set("x-markdown-tokens", String(tokens))

    return new Response(markdown, {
        status: htmlResponse.status,
        headers: responseHeaders,
    })
}
