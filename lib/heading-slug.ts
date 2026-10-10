// Shared heading-anchor logic for MDX content. The docs table of contents
// (components/marketing/docs/docs-toc.tsx) extracts headings from the raw
// markdown, while the rendered headings get their ids from the remark plugin
// below (components/shared/mdx-content.tsx). Both go through the same text
// normalisation and the same per-document slugger, so TOC links always land on
// the rendered heading — including duplicate headings and headings that contain
// inline code, links, or emphasis.

export interface DocHeading {
    id: string
    text: string
    level: 2 | 3
}

const TOC_HEADING_DEPTHS = new Set([2, 3])

function slugifyHeading(text: string): string {
    return text
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-")
}

/** Returns a slugger that de-duplicates ids within one document (`id`, `id-1`, …). */
export function createHeadingSlugger(): (text: string) => string {
    const used = new Set<string>()
    const counts = new Map<string, number>()

    return (text: string) => {
        const base = slugifyHeading(text) || "section"
        let count = counts.get(base) ?? 0
        let candidate = count === 0 ? base : `${base}-${count}`
        while (used.has(candidate)) {
            count += 1
            candidate = `${base}-${count}`
        }
        counts.set(base, count + 1)
        used.add(candidate)
        return candidate
    }
}

const HTML_ENTITIES: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": "\"",
    "&#39;": "'",
    "&nbsp;": " ",
}

function stripInlineFormatting(segment: string): string {
    return segment
        // Inline HTML / MDX JSX tags keep only their text content.
        .replace(/<\/?[A-Za-z][^>]*>/g, "")
        // Images keep their alt text, links their label.
        .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
        .replace(/\[([^\]]+)\]\[[^\]]*\]/g, "$1")
        // Strong / emphasis / strikethrough. `_` only counts at word boundaries.
        .replace(/(\*\*|__)(?=\S)(.+?)(?<=\S)\1/g, "$2")
        .replace(/\*(?=\S)(.+?)(?<=\S)\*/g, "$1")
        .replace(/(^|[^A-Za-z0-9_])_(?=\S)(.+?)(?<=\S)_(?![A-Za-z0-9_])/g, "$1$2")
        .replace(/~~(?=\S)(.+?)(?<=\S)~~/g, "$1")
        // Backslash escapes.
        .replace(/\\([\\`*_{}[\]()#+\-.!<>~|])/g, "$1")
        .replace(/&(?:amp|lt|gt|quot|#39|nbsp);/g, (entity) => HTML_ENTITIES[entity] ?? entity)
}

/** Converts a raw markdown heading line's text to the plain text a reader sees. */
export function headingTextFromMarkdown(raw: string): string {
    const withoutClosingHashes = raw.replace(/[ \t]+#+[ \t]*$/, "").trim()
    // Code spans are literal; only format the text between them.
    const parts = withoutClosingHashes.split(/(`+)([^`]|[^`].*?[^`])\1(?!`)/)
    let text = ""
    for (let i = 0; i < parts.length; i += 3) {
        text += stripInlineFormatting(parts[i] ?? "")
        const code = parts[i + 2]
        if (code !== undefined) text += code.replace(/^ (.*) $/, "$1")
    }
    return text.replace(/\s+/g, " ").trim()
}

/** Extracts h2/h3 headings (skipping fenced code) with the ids the renderer assigns. */
export function extractHeadings(markdown: string): DocHeading[] {
    const slug = createHeadingSlugger()
    const headings: DocHeading[] = []
    let fence: { char: string; length: number } | null = null

    for (const line of markdown.split(/\r?\n/)) {
        const fenceMatch = /^ {0,3}(`{3,}|~{3,})/.exec(line)
        if (fenceMatch?.[1]) {
            const marker = fenceMatch[1]
            if (!fence) {
                fence = { char: marker.charAt(0), length: marker.length }
            } else if (marker.charAt(0) === fence.char && marker.length >= fence.length && line.trim() === marker) {
                fence = null
            }
            continue
        }
        if (fence) continue

        const headingMatch = /^ {0,3}(#{2,3})[ \t]+(.+)$/.exec(line)
        if (!headingMatch?.[1] || !headingMatch[2]) continue

        const text = headingTextFromMarkdown(headingMatch[2])
        if (!text) continue
        headings.push({
            id: slug(text),
            text,
            level: headingMatch[1].length as 2 | 3,
        })
    }

    return headings
}

interface MdastNode {
    type: string
    depth?: number
    value?: string
    alt?: string | null
    children?: MdastNode[]
    data?: { hProperties?: Record<string, unknown> } & Record<string, unknown>
}

function mdastToString(node: MdastNode): string {
    if (node.type === "image") return node.alt ?? ""
    if (typeof node.value === "string" && node.type !== "mdxTextExpression" && node.type !== "mdxFlowExpression") {
        return node.value
    }
    return (node.children ?? []).map(mdastToString).join("")
}

/** Remark plugin: assigns slugger ids to h2/h3 headings in document order. */
export function remarkHeadingIds() {
    return (tree: MdastNode) => {
        const slug = createHeadingSlugger()

        const visit = (node: MdastNode) => {
            if (node.type === "code") return
            if (node.type === "heading" && node.depth !== undefined && TOC_HEADING_DEPTHS.has(node.depth)) {
                const text = mdastToString(node).replace(/\s+/g, " ").trim()
                if (text) {
                    node.data = {
                        ...node.data,
                        hProperties: { ...node.data?.hProperties, id: slug(text) },
                    }
                }
                return
            }
            node.children?.forEach(visit)
        }

        visit(tree)
    }
}
