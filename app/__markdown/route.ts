import { appendVaryHeader, buildMarkdownFetchHeaders } from "@/lib/markdown-negotiation"
import { renderMarkdownDocument } from "@/lib/markdown-render"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
    const requestUrl = new URL(request.url)
    const target = requestUrl.searchParams.get("target")

    if (!target || !target.startsWith("/") || target.startsWith("//")) {
        const headers = new Headers({
            "Content-Type": "text/plain; charset=utf-8",
        })
        appendVaryHeader(headers, "Accept")

        return new Response("Missing or invalid markdown target.", {
            status: 400,
            headers,
        })
    }

    const targetUrl = new URL(target, request.url)
    const htmlResponse = await fetch(targetUrl, {
        headers: buildMarkdownFetchHeaders(request.headers),
    })

    const htmlContentType = htmlResponse.headers.get("content-type") ?? ""
    const responseHeaders = new Headers()
    appendVaryHeader(responseHeaders, "Accept")

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
