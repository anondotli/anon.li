import type { NextRequest } from "next/server"

export const MARKDOWN_BYPASS_HEADER = "x-markdown-bypass"
export const MARKDOWN_INTERNAL_PATH = "/__markdown"

type ParsedAcceptValue = {
    index: number
    q: number
    subtype: string
    type: string
}

type AcceptMatch = {
    explicit: boolean
    q: number
    specificity: number
}

const MARKDOWN_EXCLUDED_PREFIXES = [
    MARKDOWN_INTERNAL_PATH,
    "/api",
    "/_next",
    "/admin",
    "/dashboard",
    "/login",
    "/register",
    "/reset",
    "/setup",
    "/2fa",
    "/.well-known",
] as const

const FILE_EXTENSION_PATTERN = /\/[^/]+\.[^/]+$/

function parseAcceptHeader(acceptHeader: string | null): ParsedAcceptValue[] {
    if (!acceptHeader) return []

    return acceptHeader
        .split(",")
        .map((part, index) => {
            const [mediaRange, ...rawParams] = part.split(";").map((value) => value.trim())
            const [type = "*", subtype = "*"] = mediaRange.toLowerCase().split("/")
            const qParam = rawParams.find((param) => param.startsWith("q="))
            const parsedQ = qParam ? Number.parseFloat(qParam.slice(2)) : 1
            const q = Number.isFinite(parsedQ) ? Math.min(Math.max(parsedQ, 0), 1) : 1

            return {
                index,
                q,
                subtype,
                type,
            }
        })
        .filter(({ type, subtype }) => Boolean(type) && Boolean(subtype))
}

function getBestAcceptMatch(values: ParsedAcceptValue[], mediaType: string): AcceptMatch {
    const [targetType, targetSubtype] = mediaType.split("/")
    let bestMatch: AcceptMatch = {
        explicit: false,
        q: 0,
        specificity: -1,
    }

    for (const value of values) {
        if (value.q === 0) continue

        let specificity = -1
        if (value.type === targetType && value.subtype === targetSubtype) {
            specificity = 2
        } else if (value.type === targetType && value.subtype === "*") {
            specificity = 1
        } else if (value.type === "*" && value.subtype === "*") {
            specificity = 0
        }

        if (specificity < 0) continue

        const explicit = value.type === targetType && (value.subtype === targetSubtype || value.subtype === "*")
        if (
            value.q > bestMatch.q
            || (value.q === bestMatch.q && specificity > bestMatch.specificity)
        ) {
            bestMatch = {
                explicit,
                q: value.q,
                specificity,
            }
        }
    }

    return bestMatch
}

function isExcludedPath(pathname: string) {
    return MARKDOWN_EXCLUDED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))
}

export function appendVaryHeader(headers: Headers, value: string) {
    const existing = headers.get("Vary")
    if (!existing) {
        headers.set("Vary", value)
        return
    }

    const currentValues = existing
        .split(",")
        .map((part) => part.trim().toLowerCase())
        .filter(Boolean)

    if (!currentValues.includes(value.toLowerCase())) {
        headers.set("Vary", `${existing}, ${value}`)
    }
}

export function requestPrefersMarkdown(acceptHeader: string | null): boolean {
    const parsedValues = parseAcceptHeader(acceptHeader)
    if (parsedValues.length === 0) return false

    const markdownMatch = getBestAcceptMatch(parsedValues, "text/markdown")
    if (!markdownMatch.explicit || markdownMatch.q === 0) return false

    const htmlMatch = getBestAcceptMatch(parsedValues, "text/html")

    if (markdownMatch.q > htmlMatch.q) return true
    if (markdownMatch.q < htmlMatch.q) return false

    return markdownMatch.specificity >= htmlMatch.specificity
}

export function shouldRewriteToMarkdown(request: NextRequest): boolean {
    if (request.method !== "GET") return false
    if (request.headers.get(MARKDOWN_BYPASS_HEADER) === "1") return false
    if (!requestPrefersMarkdown(request.headers.get("accept"))) return false

    const { pathname } = request.nextUrl
    if (isExcludedPath(pathname)) return false
    if (FILE_EXTENSION_PATTERN.test(pathname)) return false

    return true
}

export function createMarkdownRewriteUrl(request: NextRequest): URL {
    const rewriteUrl = request.nextUrl.clone()
    rewriteUrl.pathname = MARKDOWN_INTERNAL_PATH
    rewriteUrl.search = ""
    rewriteUrl.searchParams.set("target", `${request.nextUrl.pathname}${request.nextUrl.search}`)
    return rewriteUrl
}

export function buildMarkdownFetchHeaders(requestHeaders: Headers): Headers {
    const headers = new Headers()
    headers.set("Accept", "text/html")
    headers.set(MARKDOWN_BYPASS_HEADER, "1")

    const cookie = requestHeaders.get("cookie")
    if (cookie) {
        headers.set("cookie", cookie)
    }

    const acceptLanguage = requestHeaders.get("accept-language")
    if (acceptLanguage) {
        headers.set("accept-language", acceptLanguage)
    }

    const userAgent = requestHeaders.get("user-agent")
    if (userAgent) {
        headers.set("user-agent", userAgent)
    }

    return headers
}
