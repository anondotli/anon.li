/**
 * @vitest-environment node
 */
import { describe, expect, it } from "vitest"
import { compileMDX } from "next-mdx-remote/rsc"
import { renderToStaticMarkup } from "react-dom/server"

import { mdxRemarkPlugins } from "@/components/shared/mdx-content"
import { createHeadingSlugger, extractHeadings, headingTextFromMarkdown } from "@/lib/heading-slug"
import { getFile, getFiles } from "@/lib/mdx"

async function renderedHeadingIds(source: string): Promise<string[]> {
    const { content } = await compileMDX({
        source,
        components: {
            Callout: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
            Step: ({ children }: { children?: React.ReactNode }) => <div>{children}</div>,
            Video: () => null,
        },
        options: { mdxOptions: { remarkPlugins: mdxRemarkPlugins } },
    })
    const html = renderToStaticMarkup(content)
    return [...html.matchAll(/<h[23][^>]*\bid="([^"]+)"/g)].map((match) => match[1] ?? "")
}

describe("heading slugs", () => {
    it("strips inline markdown from heading labels", () => {
        expect(headingTextFromMarkdown("`GET /api/v1/alias`")).toBe("GET /api/v1/alias")
        expect(headingTextFromMarkdown("Create a **new** [alias](/docs/api/alias)")).toBe("Create a new alias")
        expect(headingTextFromMarkdown("The `snake_case` _field_ ##")).toBe("The snake_case field")
        expect(headingTextFromMarkdown("Rate limits & quotas")).toBe("Rate limits & quotas")
    })

    it("suffixes duplicate headings", () => {
        const slug = createHeadingSlugger()
        expect([slug("Errors"), slug("Errors"), slug("Errors-1"), slug("Errors")]).toEqual([
            "errors",
            "errors-1",
            "errors-1-1",
            "errors-2",
        ])
    })

    it("ignores headings inside fenced code", () => {
        const headings = extractHeadings([
            "## Request",
            "```bash",
            "## not a heading",
            "```",
            "### `POST /alias`",
            "## Request",
        ].join("\n"))

        expect(headings).toEqual([
            { id: "request", text: "Request", level: 2 },
            { id: "post-alias", text: "POST /alias", level: 3 },
            { id: "request-1", text: "Request", level: 2 },
        ])
    })

    it("TOC ids match rendered heading ids for formatted and duplicate headings", async () => {
        const source = [
            "## Overview",
            "### `GET /alias/:id`",
            "## The **Drop** [API](/docs/api/drop)",
            "## Overview",
            "```md",
            "## fake",
            "```",
        ].join("\n\n")

        expect(await renderedHeadingIds(source)).toEqual(extractHeadings(source).map((heading) => heading.id))
    })

    it("TOC ids match rendered heading ids for every docs page", async () => {
        const files = await getFiles("docs")
        for (const file of files) {
            const doc = await getFile("docs", file.replace(/\.mdx$/, ""))
            if (!doc) continue

            expect(
                await renderedHeadingIds(doc.content),
                `TOC anchors drift from rendered headings in content/docs/${file}`,
            ).toEqual(extractHeadings(doc.content).map((heading) => heading.id))
        }
    })
})
