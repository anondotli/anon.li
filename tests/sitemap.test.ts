/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"

import sitemap from "@/app/sitemap"
import { getDocsHrefFromContentSlug, getDocsRouteSlugs } from "@/config/docs"

describe("docs canonical URLs", () => {
    it("maps index docs and legal docs to their canonical routes", () => {
        expect(getDocsHrefFromContentSlug("api/index")).toBe("/docs/api")
        expect(getDocsHrefFromContentSlug("cli/index")).toBe("/docs/cli")
        expect(getDocsHrefFromContentSlug("api/alias")).toBe("/docs/api/alias")
        expect(getDocsHrefFromContentSlug("getting-started")).toBe("/docs/getting-started")
        expect(getDocsHrefFromContentSlug("legal/privacy")).toBe("/privacy")
        expect(getDocsHrefFromContentSlug("legal/terms")).toBe("/terms")
        expect(getDocsHrefFromContentSlug("legal/aup")).toBe("/docs/legal/aup")
    })

    it("generates docs route params without index or legal duplicates", () => {
        expect(getDocsRouteSlugs(["api/index", "api/alias", "legal/privacy", "legal/terms", "legal/aup"])).toEqual([
            ["api"],
            ["api", "alias"],
            ["legal", "aup"],
        ])
    })
})

describe("sitemap", () => {
    it("lists canonical docs URLs only", async () => {
        const urls = (await sitemap()).map((entry) => entry.url)

        expect(urls).toContain("https://anon.li/docs/api")
        expect(urls).toContain("https://anon.li/docs/cli")
        expect(urls).toContain("https://anon.li/docs/api/alias")
        expect(urls).toContain("https://anon.li/docs/legal/aup")
        expect(urls).toContain("https://anon.li/privacy")
        expect(urls).toContain("https://anon.li/terms")
        expect(urls).toContain("https://anon.li/report")

        expect(urls.some((url) => url.endsWith("/index"))).toBe(false)
        expect(urls).not.toContain("https://anon.li/docs/legal/privacy")
        expect(urls).not.toContain("https://anon.li/docs/legal/terms")
        expect(urls.some((url) => url.includes("__markdown"))).toBe(false)
        expect(new Set(urls).size).toBe(urls.length)
    })
})
