import { describe, expect, it } from "vitest"

import { docsConfig, getDocsContentSlugCandidatesFromHref } from "@/config/docs"
import { getFiles } from "@/lib/mdx"

describe("docs navigation integrity", () => {
    it("every configured docs entry points to a real MDX file", async () => {
        const files = await getFiles("docs")
        const slugs = new Set(files.map((file) => file.replace(/\.mdx$/, "")))

        for (const item of docsConfig.sidebarNav.flatMap((section) => section.items)) {
            const candidates = getDocsContentSlugCandidatesFromHref(item.href)
            expect(
                candidates.some((slug) => slugs.has(slug)),
                `Configured docs href "${item.href}" does not resolve to a file in content/docs`
            ).toBe(true)
        }
    })

    it("every docs MDX file is discoverable from navigation", async () => {
        const files = await getFiles("docs")
        const configuredCandidates = new Set(
            docsConfig.sidebarNav.flatMap((section) =>
                section.items.flatMap((item) => getDocsContentSlugCandidatesFromHref(item.href))
            )
        )

        for (const file of files) {
            const slug = file.replace(/\.mdx$/, "")
            expect(configuredCandidates.has(slug), `Docs file "${slug}" is orphaned from docsConfig`).toBe(true)
        }
    })
})
