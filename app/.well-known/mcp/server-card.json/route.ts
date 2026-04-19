import { getMcpServerCard } from "@/lib/mcp/server-card"

export const revalidate = 3600

const CACHE_CONTROL = "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400"
const CORS_HEADERS = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, MCP-Protocol-Version",
}

export function GET() {
    return Response.json(getMcpServerCard(), {
        headers: {
            ...CORS_HEADERS,
            "Cache-Control": CACHE_CONTROL,
        },
    })
}

export function OPTIONS() {
    return new Response(null, {
        status: 204,
        headers: {
            ...CORS_HEADERS,
            "Access-Control-Max-Age": "86400",
        },
    })
}
