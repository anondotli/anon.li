"use client"

import Script from "next/script"
import { usePathname } from "next/navigation"
import { shouldEnableAnalytics } from "@/lib/analytics-policy"

const DEFAULT_UMAMI_SCRIPT_URL = "https://cloud.umami.is/script.js"

export function AnalyticsScript() {
    const pathname = usePathname()
    const websiteId = process.env.NEXT_PUBLIC_UMAMI_WEBSITE_ID
    if (!websiteId || !shouldEnableAnalytics(pathname)) return null

    return (
        <Script
            defer
            src={process.env.NEXT_PUBLIC_UMAMI_URL || DEFAULT_UMAMI_SCRIPT_URL}
            data-website-id={websiteId}
            strategy="afterInteractive"
        />
    )
}
