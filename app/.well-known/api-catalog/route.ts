import { API_CATALOG_PROFILE, getApiCatalogDocument } from "@/config/agent-discovery"

export const revalidate = 3600

export function GET() {
    return new Response(JSON.stringify(getApiCatalogDocument()), {
        headers: {
            "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
            "Content-Type": `application/linkset+json; profile="${API_CATALOG_PROFILE}"`,
        },
    })
}
