import { siteConfig } from "@/config/site"
import { MARKDOWN_INTERNAL_PATH } from "@/lib/markdown-negotiation"

export const dynamic = "force-static"

const contentSignal = "Content-Signal: ai-train=yes, search=yes, ai-input=yes"

export function GET() {
    const robots = [
        "User-Agent: *",
        "Allow: /",
        "Disallow: /dashboard/",
        "Disallow: /api/",
        `Disallow: ${MARKDOWN_INTERNAL_PATH}`,
        "",
        contentSignal,
        `Sitemap: ${siteConfig.default.url}/sitemap.xml`,
        "",
    ].join("\n")

    return new Response(robots, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
        },
    })
}
