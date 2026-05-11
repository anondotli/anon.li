import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { getSessionCookie } from "better-auth/cookies";
import { nanoid } from "nanoid";
import { shouldEnableAnalytics } from "@/lib/analytics-policy";
import { appendVaryHeader, createMarkdownRewriteUrl, shouldRewriteToMarkdown } from "@/lib/markdown-negotiation";
import { THEME_INIT_SCRIPT_SHA256 } from "@/lib/theme-init";

const DEFAULT_UMAMI_SCRIPT_URL = "https://cloud.umami.is/script.js"
const DEFAULT_UMAMI_API_URL = "https://api-gateway.umami.dev/api/send"
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com"
const TWO_FACTOR_COOKIE_NAMES = ["better-auth.two_factor", "__Secure-better-auth.two_factor"] as const

// SHA-256 of next-themes' SSR-injected <script>, pinned for strict-mode CSP.
// Content is derived from the props passed to <ThemeProvider> in app/layout.tsx
// plus next-themes' internal helper. If either the version or those props
// change, the browser will report the new expected hash in a CSP error — copy
// it here. Currently tied to next-themes ^0.4.6 with attribute="class",
// defaultTheme="system", enableSystem, disableTransitionOnChange.
const NEXT_THEMES_SCRIPT_SHA256 = "n46vPwSWuMC0W703pBofImv82Z26xo4LXymv0E9caPk="

// Paths that render per-request and need a strict nonce-based CSP.
// Everything else (marketing, blog, docs, public drop/form pages) is treated
// as static-eligible and receives a relaxed-but-scoped CSP without nonce so
// the HTML can be cached at the edge.
const STRICT_CSP_PATH_PREFIXES = [
    "/api",
    "/dashboard",
    "/admin",
    "/login",
    "/register",
    "/reset",
    "/setup",
    "/2fa",
    "/verify-recipient",
    "/workspace",
    "/oauth",
] as const

function pathNeedsStrictCsp(pathname: string): boolean {
    return STRICT_CSP_PATH_PREFIXES.some(
        (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
    )
}

function getOrigin(url: string | undefined, fallback: string): string {
    try {
        return new URL(url || fallback).origin
    } catch {
        return new URL(fallback).origin
    }
}

function extractOrigin(url: string | undefined): string | null {
    if (!url) return null

    try {
        return new URL(url).origin
    } catch {
        return null
    }
}

function buildCsp(
    nonce: string | null,
    analyticsEnabled: boolean,
    allowEmbed: boolean,
    strict: boolean,
) {
    const isDev = process.env.NODE_ENV === "development"
    const umamiOrigin = getOrigin(process.env.NEXT_PUBLIC_UMAMI_URL, DEFAULT_UMAMI_SCRIPT_URL)
    const umamiApiOrigin = getOrigin(process.env.NEXT_PUBLIC_UMAMI_API_URL, DEFAULT_UMAMI_API_URL)
    const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY)
    const r2PublicOrigin = extractOrigin(process.env.R2_PUBLIC_ENDPOINT)
    const r2DirectOrigin = extractOrigin(process.env.R2_ENDPOINT)

    // Strict mode: nonce + 'strict-dynamic' for dynamic auth/dashboard/admin
    // routes where session-aware HTML is rendered per request. The two
    // theme-bootstrap inline scripts in app/layout.tsx (anti-FOUC + next-themes)
    // are pinned by SHA-256 hash so they survive without a nonce attribute —
    // adding a nonce there would force the whole shared layout dynamic.
    // Relaxed mode: 'unsafe-inline' for static-eligible marketing/public pages
    // so the HTML can be edge-cached (a per-request nonce would force dynamic
    // rendering on every request). A hash cannot coexist with 'unsafe-inline'
    // — once any hash is in script-src, browsers ignore 'unsafe-inline' and
    // block Next.js's own framework inline scripts (e.g. __next_f.push).
    const scriptSrc = [
        "'self'",
        isDev ? null : (strict && nonce ? `'nonce-${nonce}'` : null),
        isDev ? null : (strict ? "'strict-dynamic'" : null),
        strict ? `'sha256-${THEME_INIT_SCRIPT_SHA256}'` : null,
        strict ? `'sha256-${NEXT_THEMES_SCRIPT_SHA256}'` : null,
        (isDev || !strict) ? "'unsafe-inline'" : null,
        isDev ? "'unsafe-eval'" : null,
        "'wasm-unsafe-eval'",
        analyticsEnabled ? umamiOrigin : null,
        turnstileEnabled ? TURNSTILE_ORIGIN : null,
    ].filter((value): value is string => Boolean(value)).join(" ")

    const connectSrc = [
        "'self'",
        analyticsEnabled ? umamiOrigin : null,
        analyticsEnabled ? umamiApiOrigin : null,
        turnstileEnabled ? TURNSTILE_ORIGIN : null,
        r2PublicOrigin,
        r2DirectOrigin,
    ].filter((value): value is string => Boolean(value)).join(" ")

    const frameSrc = turnstileEnabled ? TURNSTILE_ORIGIN : "'none'"
    const frameAncestors = allowEmbed ? "*" : "'none'"

    return [
        "default-src 'self'",
        `script-src ${scriptSrc}`,
        "style-src 'self' 'unsafe-inline'",
        "img-src 'self' data: blob: https://*.googleusercontent.com https://avatars.githubusercontent.com https://www.google.com https://*.gstatic.com",
        "media-src 'self' blob:",
        "font-src 'self' data:",
        `connect-src ${connectSrc}`,
        `frame-src ${frameSrc}`,
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        `frame-ancestors ${frameAncestors}`,
        "upgrade-insecure-requests",
    ].join("; ")
}

// Public form pages are intentionally embeddable from any origin.
function isEmbeddablePath(pathname: string): boolean {
    return pathname === "/f" || pathname.startsWith("/f/") || pathname.startsWith("/embed/f/")
}

function hasPendingTwoFactorCookie(req: NextRequest) {
    return TWO_FACTOR_COOKIE_NAMES.some((name) => Boolean(req.cookies.get(name)?.value))
}

export default async function proxy(req: NextRequest) {
    const { nextUrl } = req
    const pathname = nextUrl.pathname

    // Generate unique request ID for tracing
    const requestId = nanoid(21)

    const needsAuth = pathname.startsWith('/dashboard')
        || pathname.startsWith('/admin')
        || pathname === '/2fa'

    // Better Auth removes the normal session cookie while 2FA is pending.
    // The 2FA page/action validates the signed temporary cookie.
    const canAccessPendingTwoFactor = pathname === "/2fa" && hasPendingTwoFactorCookie(req)
    if (needsAuth && !getSessionCookie(req) && !canAccessPendingTwoFactor) {
        return NextResponse.redirect(new URL('/login', nextUrl))
    }

    const strictCsp = pathNeedsStrictCsp(pathname)
    // Only generate a nonce when the route renders dynamically. Static-eligible
    // marketing pages would have to render per-request to embed a unique nonce,
    // which defeats edge caching.
    const nonce = strictCsp ? crypto.randomBytes(16).toString("base64") : null
    const analyticsEnabled = shouldEnableAnalytics(pathname)
    const allowEmbed = isEmbeddablePath(pathname)
    const csp = buildCsp(nonce, analyticsEnabled, allowEmbed, strictCsp)
    const requestHeaders = new Headers(req.headers)
    if (nonce) {
        requestHeaders.set("x-nonce", nonce)
    }
    requestHeaders.set("x-analytics-enabled", analyticsEnabled ? "1" : "0")
    requestHeaders.set("Content-Security-Policy", csp)

    if (shouldRewriteToMarkdown(req)) {
        const response = NextResponse.rewrite(createMarkdownRewriteUrl(req), {
            request: {
                headers: requestHeaders,
            },
        })

        response.headers.set("X-Request-Id", requestId)
        appendVaryHeader(response.headers, "Accept")

        return response
    }

    const response = NextResponse.next({
        request: {
            headers: requestHeaders,
        },
    });

    // Attach request ID for downstream logging and client debugging
    response.headers.set("X-Request-Id", requestId)
    response.headers.set("Content-Security-Policy", csp)
    appendVaryHeader(response.headers, "Accept")

    // CORS for API routes
    if (pathname.startsWith("/api/")) {
        const origin = req.headers.get("origin")
        const appUrl = process.env.NEXT_PUBLIC_APP_URL

        if (origin && appUrl && origin === new URL(appUrl).origin) {
            response.headers.set("Access-Control-Allow-Origin", origin)
            response.headers.set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
            response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Api-Secret")
            response.headers.set("Access-Control-Max-Age", "86400")
        }

        // Handle preflight
        if (req.method === "OPTIONS") {
            return new NextResponse(null, {
                status: 204,
                headers: response.headers,
            })
        }
    }

    return response;
}

// Skip middleware on Next internals, /public static files, .well-known/*, and
// /api/health. These don't need CSP/nonce/CORS handling, and skipping them
// avoids a per-request crypto.randomBytes + nanoid + CSP build that previously
// ran on every uptime probe, sitemap fetch, robots fetch, and asset request.
export const config = {
    matcher: [
        '/((?!_next/static|_next/image|_next/data|favicon\\.ico|favicon-\\d+x\\d+\\.png|apple-touch-icon\\.png|android-chrome-\\d+x\\d+\\.png|icon-\\d+\\.png|og-image\\.png|noise\\.svg|black-square\\.svg|white-square\\.svg|site\\.webmanifest|canary\\.json|robots\\.txt|llms\\.txt|sitemap\\.xml|sitemap-\\d+\\.xml|fonts/.*|videos/.*|blog/.*|cli/.*|docs/.*|\\.well-known/.*|api/health).*)',
    ],
};
