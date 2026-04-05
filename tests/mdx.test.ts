import { expect, test } from "vitest"
import { getFile, getFiles, getAllFilesFrontMatter } from "../lib/mdx"

test("getFiles returns list of files", async () => {
    const files = await getFiles("docs")
    expect(files.length).toBeGreaterThan(0)
    // Check for a known file
    expect(files.some(f => f.includes("getting-started.mdx"))).toBe(true)
})

test("getFile returns correct content", async () => {
    const file = await getFile("docs", "getting-started")
    expect(file).toBeDefined()
    expect(file?.slug).toBe("getting-started")
    expect(file?.content).toBeDefined()
    expect(file?.content).toContain("Welcome to anon.li")
})

test("getAllFilesFrontMatter returns all frontmatter", async () => {
    const posts = await getAllFilesFrontMatter("docs")
    expect(posts.length).toBeGreaterThan(0)
    const post = posts.find(p => p.slug === "getting-started")
    expect(post).toBeDefined()
    expect(post?.title).toBeDefined() // Assuming it has title in frontmatter
})
