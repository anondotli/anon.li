interface DocsNavItem {
    title: string
    href: string
    matchPath?: string
}

interface DocsNavSection {
    title: string
    items: DocsNavItem[]
}

interface DocsConfig {
    sidebarNav: DocsNavSection[]
}

export const docsConfig: DocsConfig = {
    sidebarNav: [
        {
            title: "Getting Started",
            items: [
                {
                    title: "Introduction",
                    href: "/docs/getting-started",
                },
                {
                    title: "Browser Extension",
                    href: "/docs/extension",
                },
                {
                    title: "MCP Server",
                    href: "/docs/mcp",
                },
                {
                    title: "Security",
                    href: "/docs/security",
                },
            ],
        },
        {
            title: "CLI",
            items: [
                {
                    title: "Overview",
                    href: "/docs/cli",
                },
                {
                    title: "Drop Commands",
                    href: "/docs/cli/drop",
                },
                {
                    title: "Alias Commands",
                    href: "/docs/cli/alias",
                },
                {
                    title: "Recipient Commands",
                    href: "/docs/cli/recipient",
                },
                {
                    title: "Domain Commands",
                    href: "/docs/cli/domain",
                },
            ],
        },
        {
            title: "API",
            items: [
                {
                    title: "Overview",
                    href: "/docs/api",
                },
                {
                    title: "Alias API",
                    href: "/docs/api/alias",
                },
                {
                    title: "Drop API",
                    href: "/docs/api/drop",
                },
                {
                    title: "Domain API",
                    href: "/docs/api/domain",
                },
                {
                    title: "Recipient API",
                    href: "/docs/api/recipient",
                },
            ],
        },
        {
            title: "Legal",
            items: [
                {
                    title: "Privacy Policy",
                    href: "/privacy",
                },
                {
                    title: "Terms of Service",
                    href: "/terms",
                },
                {
                    title: "Acceptable Use Policy",
                    href: "/docs/legal/aup",
                },
                {
                    title: "DMCA Policy",
                    href: "/docs/legal/dmca",
                },
            ],
        },
    ],
}

const docsRouteToContentSlug: Record<string, string> = {
    "/privacy": "legal/privacy",
    "/terms": "legal/terms",
}

function getDocsContentSlugFromHref(href: string): string | null {
    if (href in docsRouteToContentSlug) {
        return docsRouteToContentSlug[href] ?? null
    }

    if (!href.startsWith("/docs/")) {
        return null
    }

    return href.replace(/^\/docs\//, "")
}

export function getDocsContentSlugCandidatesFromHref(href: string): string[] {
    const slug = getDocsContentSlugFromHref(href)
    if (!slug) return []

    if (slug.endsWith("/index")) {
        return [slug]
    }

    return [slug, `${slug}/index`]
}
