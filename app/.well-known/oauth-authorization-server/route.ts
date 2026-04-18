import { auth } from "@/lib/auth"
import { normalizeMcpAuthorizationMetadata } from "@/lib/mcp/oauth-metadata"

export const dynamic = "force-dynamic"

export async function GET(request: Request) {
    const metadata = await auth.api.getMcpOAuthConfig({ request, asResponse: false })
    return Response.json(normalizeMcpAuthorizationMetadata(metadata))
}
