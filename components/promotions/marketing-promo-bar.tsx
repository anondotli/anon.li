"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"

import { getActivePromotion, type Promotion } from "@/config/promotions"
import { authClient } from "@/lib/auth-client"
import { PromoBar } from "@/components/promotions/promo-bar"

/**
 * Site-wide offer strip for the statically prerendered marketing pages, so it
 * decides on the client. Only signed-out visitors see it here: whether a
 * signed-in viewer is a paying customer is a server-side check, so they get
 * the eligibility-checked offer on /pricing and in the dashboard instead.
 */
export function MarketingPromoBar() {
    const pathname = usePathname()
    // Shares the session store SiteHeader already loads — no extra request.
    const { data: session, isPending } = authClient.useSession()
    const [promotion, setPromotion] = useState<Promotion | null>(null)

    // Read the clock after mount: the HTML was prerendered at build time.
    useEffect(() => {
        const timer = window.setTimeout(() => setPromotion(getActivePromotion()), 0)
        return () => window.clearTimeout(timer)
    }, [])

    // /pricing renders its own, server-checked banner.
    if (!promotion || isPending || session?.user || pathname === "/pricing") return null

    return <PromoBar promotion={promotion} />
}
