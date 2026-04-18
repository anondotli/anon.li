import { auth } from "@/lib/auth"
import { normalizeMcpProtectedResourceMetadata } from "@/lib/mcp/oauth-metadata"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
    const metadata = await auth.api.getMCPProtectedResource({ request, asResponse: false })
    return Response.json(normalizeMcpProtectedResourceMetadata(metadata))
}
