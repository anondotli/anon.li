import { describe, expect, it } from "vitest"

import { parseFrontmatter } from "@/lib/frontmatter"

describe("parseFrontmatter", () => {
    it("parses a YAML mapping and returns the MDX body", () => {
        expect(parseFrontmatter("---\ntitle: Private files\ntags:\n  - drop\n---\n# Hello\n"))
            .toEqual({
                data: { title: "Private files", tags: ["drop"] },
                content: "# Hello\n",
            })
    })

    it("does not treat indented delimiters inside block scalars as the closing marker", () => {
        expect(parseFrontmatter("---\ndescription: |\n  first\n  ---\n  last\n---\nBody"))
            .toEqual({
                data: { description: "first\n---\nlast\n" },
                content: "Body",
            })
    })

    it("returns documents without frontmatter unchanged", () => {
        expect(parseFrontmatter("# Plain MDX\n")).toEqual({
            data: {},
            content: "# Plain MDX\n",
        })
    })

    it("rejects unterminated frontmatter", () => {
        expect(() => parseFrontmatter("---\ntitle: Broken\n"))
            .toThrow("Frontmatter is missing a closing delimiter")
    })
})
