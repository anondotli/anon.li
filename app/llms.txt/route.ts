import { BUSINESS_SEAT_PRICE } from "@/config/plans"
import { docsConfig } from "@/config/docs"
import { getAllFilesFrontMatter, type FrontMatter } from "@/lib/mdx"
import { getPublicPricingCatalog } from "@/lib/public-pricing"

// Generated at build time from the same sources as the site (plan config,
// docs navigation, blog frontmatter) so prices and page lists can't drift.
export const dynamic = "force-static"

const SITE_URL = "https://anon.li"

interface BlogPost extends FrontMatter {
    title?: string
    publishedAt?: string
}

const usd = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", minimumFractionDigits: 2 })

function absolute(href: string): string {
    return href.startsWith("http") ? href : `${SITE_URL}${href}`
}

function pricingLines(): string[] {
    const catalog = getPublicPricingCatalog()
    const lines = catalog.products.map((product) => {
        const paid = product.plans
            .filter((plan) => plan.prices.monthly > 0)
            .map((plan) => `${plan.name}: ${usd.format(plan.prices.monthly)}/month or ${usd.format(plan.prices.yearly)}/year`)
        return `- ${product.name} — ${paid.join(". ")}.`
    })
    const freeProducts = catalog.products
        .filter((product) => product.plans.some((plan) => plan.prices.monthly === 0))
        .map((product) => product.name)

    return [
        ...lines,
        `- Business: ${usd.format(BUSINESS_SEAT_PRICE.monthly)}/seat/month or ${usd.format(BUSINESS_SEAT_PRICE.yearly)}/seat/year. Enterprise: custom pricing (contact sales).`,
        `- Free plans are available for ${freeProducts.join(", ")}.`,
    ]
}

async function blogLines(): Promise<string[]> {
    const posts = await getAllFilesFrontMatter<BlogPost>("blog")
    return posts
        .sort((a, b) => (b.publishedAt ?? "").localeCompare(a.publishedAt ?? ""))
        .map((post) => `- [${post.title ?? post.slug}](${SITE_URL}/blog/${post.slug})`)
}

function docsLines(): string[] {
    return docsConfig.sidebarNav
        .filter((section) => section.title !== "Legal")
        .flatMap((section) => section.items.map((item) => {
            const label = item.title === "Overview" ? `${section.title}: Overview` : item.title
            return `- [${label}](${absolute(item.href)})`
        }))
}

function legalLines(): string[] {
    const legal = docsConfig.sidebarNav.find((section) => section.title === "Legal")?.items ?? []
    return [
        ...legal.map((item) => `- [${item.title}](${absolute(item.href)})`),
        `- [Sub-processors](${SITE_URL}/sub-processors)`,
        `- [Warrant Canary](${SITE_URL}/warrant-canary)`,
        `- [Report Abuse](${SITE_URL}/report)`,
    ]
}

export async function GET() {
    const body = [
        "# anon.li",
        "",
        "> Privacy-first platform providing private email aliases, end-to-end encrypted file sharing, and end-to-end encrypted forms.",
        "",
        "## About",
        "",
        "anon.li is a privacy-focused platform with three products:",
        "",
        "- **Alias**: Private email forwarding. Create aliases that forward to your real inbox without exposing your personal address. Supports custom domains, PGP encryption, and replying from the alias.",
        "- **Drop**: End-to-end encrypted file sharing. Files are encrypted in your browser with AES-256-GCM; the decryption key stays in the link fragment and never reaches the server. Public previews count as downloads because they expose the full encrypted file bytes.",
        "- **Form**: End-to-end encrypted forms. Submissions are encrypted in the submitter's browser to the form owner's key; anon.li stores only ciphertext.",
        "",
        "All services are open source (AGPL-3.0). API keys are managed from an authenticated dashboard session; API-key requests count against monthly API quotas. An MCP server lets AI assistants manage aliases, drops, and forms over OAuth — it cannot read encrypted content.",
        "",
        "## Key Pages",
        "",
        `- [Homepage](${SITE_URL}/)`,
        `- [Email Aliases (Alias)](${SITE_URL}/alias)`,
        `- [File Sharing (Drop)](${SITE_URL}/drop)`,
        `- [Upload a File](${SITE_URL}/drop/upload)`,
        `- [Encrypted Forms (Form)](${SITE_URL}/form)`,
        `- [MCP Server](${SITE_URL}/mcp)`,
        `- [CLI](${SITE_URL}/cli)`,
        `- [Browser Extension](${SITE_URL}/extension)`,
        `- [Pricing](${SITE_URL}/pricing)`,
        `- [Pricing Data (JSON)](${SITE_URL}/pricing.json) — machine-readable products, tiers, USD prices, billing intervals, feature lists, and limits.`,
        `- [Business](${SITE_URL}/business)`,
        `- [Security](${SITE_URL}/security)`,
        `- [About](${SITE_URL}/about)`,
        `- [FAQ](${SITE_URL}/faq)`,
        `- [Compare](${SITE_URL}/compare)`,
        "",
        "## Documentation",
        "",
        `- [Documentation Home](${SITE_URL}/docs)`,
        ...docsLines(),
        "",
        "## Pricing",
        "",
        `Canonical machine-readable pricing is available at ${SITE_URL}/pricing.json. All prices in USD.`,
        "",
        ...pricingLines(),
        "",
        "## Legal",
        "",
        ...legalLines(),
        "",
        "## Blog",
        "",
        ...(await blogLines()),
        "",
        "## Open Source",
        "",
        "- [GitHub](https://github.com/anondotli/anon.li)",
        "",
    ].join("\n")

    return new Response(body, {
        headers: {
            "Content-Type": "text/plain; charset=utf-8",
        },
    })
}
