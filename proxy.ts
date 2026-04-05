import { NextResponse, type NextRequest } from "next/server";
import crypto from "crypto";
import { getSessionCookie } from "better-auth/cookies";
import { nanoid } from "nanoid";

export default async function proxy(req: NextRequest) {
    const { nextUrl } = req
    const pathname = nextUrl.pathname

    // Generate unique request ID for tracing
    const requestId = nanoid(21)

    if (pathname.startsWith("/api/internal")) {
        const expectedSecret = process.env.MAIL_API_SECRET

        if (!expectedSecret) {
            console.error("MAIL_API_SECRET not configured")
            return NextResponse.json(
                { error: "Internal server error" },
                { status: 500 }
            )
        }
        const xApiSecret = req.headers.get("x-api-secret")
        const authHeader = req.headers.get("authorization")
        const providedToken = xApiSecret
            || (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : "")

        const secretHash = crypto.createHash("sha256").update(expectedSecret).digest()
        const providedHash = crypto.createHash("sha256").update(providedToken || "").digest()

        if (!providedToken || !crypto.timingSafeEqual(secretHash, providedHash)) {
            return NextResponse.json(
                { error: "Unauthorized" },
                { status: 401 }
            )
        }
    }

    const needsAuth = pathname.startsWith('/dashboard')
        || pathname.startsWith('/admin')
        || pathname === '/verify-2fa'

    if (needsAuth && !getSessionCookie(req)) {
        return NextResponse.redirect(new URL('/login', nextUrl))
    }

    const response = NextResponse.next();

    // Attach request ID for downstream logging and client debugging
    response.headers.set("X-Request-Id", requestId)

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

export const config = {
    matcher: [
        '/((?!_next/static|_next/image|favicon.ico).*)',
    ],
};
