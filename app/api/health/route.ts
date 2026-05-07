import { NextResponse } from "next/server"

// Cheap liveness probe for uptime monitors. No DB, no auth, no middleware.
// The proxy matcher excludes /api/health to skip nonce/CSP/CORS work.
export const dynamic = "force-static"

export function GET() {
    return new NextResponse("ok", {
        status: 200,
        headers: { "content-type": "text/plain", "cache-control": "no-store" },
    })
}
