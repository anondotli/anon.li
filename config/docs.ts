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
                    title: "Form API",
                    href: "/docs/api/form",
                },
                {
                    title: "Domain API",
                    href: "/docs/api/domain",
                },
                {
                    title: "Recipient API",
                    href: "/docs/api/recipient",
                },
                {
                    title: "MCP Server",
                    href: "/docs/api/mcp",
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

/**
 * Canonical public URL for a content/docs slug (file path without `.mdx`):
 * `api/index` → `/docs/api`, and legal documents that have their own
 * top-level page (`legal/privacy` → `/privacy`) map to that page.
 */
export function getDocsHrefFromContentSlug(contentSlug: string): string {
    const routeEntry = Object.entries(docsRouteToContentSlug).find(([, slug]) => slug === contentSlug)
    if (routeEntry) return routeEntry[0]

    if (contentSlug === "index") return "/docs"
    const withoutIndex = contentSlug.replace(/\/index$/, "")
    return `/docs/${withoutIndex}`
}

/**
 * Catch-all params for the docs pages that should be served under /docs/...
 * Excludes `/index` duplicates and docs canonically served elsewhere.
 */
export function getDocsRouteSlugs(contentSlugs: string[]): string[][] {
    const routes = new Set<string>()
    for (const contentSlug of contentSlugs) {
        const href = getDocsHrefFromContentSlug(contentSlug)
        if (href.startsWith("/docs/")) routes.add(href.slice("/docs/".length))
    }
    return [...routes].map((route) => route.split("/"))
}
