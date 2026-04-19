import { siteConfig } from "./site"
import { MCP_SERVER_CARD_PATH } from "../lib/mcp/server-card"

const API_CATALOG_PATH = "/.well-known/api-catalog"
export const API_CATALOG_PROFILE = "https://www.rfc-editor.org/info/rfc9727"

type HeaderLink = {
    href: string
    rel: string
    type?: string
}

type LinkTarget = {
    href: string
    type?: string
}

type ApiCatalogEntry = {
    anchor: string
    item?: LinkTarget[]
    "service-doc"?: LinkTarget[]
    "service-meta"?: LinkTarget[]
}

type ApiCatalogDocument = {
    linkset: ApiCatalogEntry[]
}

type ApiCatalogResource = {
    documentationPath: string
    metadataPaths?: readonly string[]
    path: string
}

const homepageDiscoveryLinks: HeaderLink[] = [
    {
        href: API_CATALOG_PATH,
        rel: "api-catalog",
        type: "application/linkset+json",
    },
    {
        href: "/docs/api",
        rel: "service-doc",
        type: "text/html",
    },
    {
        href: "/docs/api/mcp",
        rel: "service-doc",
        type: "text/html",
    },
]

const apiCatalogResources: readonly ApiCatalogResource[] = [
    {
        path: "/api/v1/alias",
        documentationPath: "/docs/api/alias",
    },
    {
        path: "/api/v1/drop",
        documentationPath: "/docs/api/drop",
    },
    {
        path: "/api/v1/domain",
        documentationPath: "/docs/api/domain",
    },
    {
        path: "/api/v1/recipient",
        documentationPath: "/docs/api/recipient",
    },
    {
        path: "/api/mcp",
        documentationPath: "/docs/api/mcp",
        metadataPaths: [
            MCP_SERVER_CARD_PATH,
            "/.well-known/oauth-authorization-server",
            "/.well-known/oauth-protected-resource",
        ],
    },
] as const

function toAbsoluteUrl(path: string, baseUrl = siteConfig.default.url) {
    return new URL(path, baseUrl).toString()
}

function formatLinkHeaderValue({ href, rel, type }: HeaderLink) {
    return `<${href}>; rel="${rel}"${type ? `; type="${type}"` : ""}`
}

export const HOMEPAGE_LINK_HEADER = homepageDiscoveryLinks
    .map(formatLinkHeaderValue)
    .join(", ")

export function getApiCatalogDocument(baseUrl = siteConfig.default.url): ApiCatalogDocument {
    const apiCatalogUrl = toAbsoluteUrl(API_CATALOG_PATH, baseUrl)

    return {
        linkset: [
            {
                anchor: apiCatalogUrl,
                item: apiCatalogResources.map(({ path }) => ({
                    href: toAbsoluteUrl(path, baseUrl),
                })),
            },
            ...apiCatalogResources.map(({ path, documentationPath, metadataPaths }) => ({
                anchor: toAbsoluteUrl(path, baseUrl),
                "service-doc": [
                    {
                        href: toAbsoluteUrl(documentationPath, baseUrl),
                        type: "text/html",
                    },
                ],
                ...(metadataPaths
                    ? {
                        "service-meta": metadataPaths.map((metadataPath) => ({
                            href: toAbsoluteUrl(metadataPath, baseUrl),
                            type: "application/json",
                        })),
                    }
                    : {}),
            })),
        ],
    }
}
