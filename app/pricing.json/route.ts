import { NextResponse } from "next/server"

import { getPublicPricingCatalog } from "@/lib/public-pricing"

export const revalidate = 3600

export function GET() {
    return NextResponse.json(getPublicPricingCatalog(), {
        headers: {
            "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400",
        },
    })
}
