import { siteConfig } from "@/config/site"

export const dynamic = "force-static"

const contentSignal = "Content-Signal: ai-train=yes, search=yes, ai-input=yes"

export function GET() {
    const robots = [
        "User-Agent: *",
        "Allow: /",
        "Disallow: /dashboard/",
        "Disallow: /api/",
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
