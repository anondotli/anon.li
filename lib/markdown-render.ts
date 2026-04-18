type HtmlToTextCompile = (options: unknown) => (html: string, metadata?: { baseUrl: string }) => string
type HtmlToTextModule = {
    compile: HtmlToTextCompile
}

type HtmlToTextBuilder = {
    addInline: (text: string) => void
    closeBlock: (options?: { trailingLineBreaks?: number }) => void
    metadata?: {
        baseUrl: string
    }
    openBlock: (options?: { leadingLineBreaks?: number }) => void
}

type HtmlToTextElement = {
    attribs?: Record<string, string>
    children?: HtmlToTextNode[]
    data?: string
    type?: string
}

type HtmlToTextNode = HtmlToTextElement

type HtmlToTextWalk = (nodes: HtmlToTextNode[] | undefined, builder: HtmlToTextBuilder) => void

type MarkdownDocument = {
    markdown: string
    tokens: number
}

// `html-to-text` ships without TypeScript declarations here, so we load it via
// CommonJS and keep the typing boundary local to this module.
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { compile } = require("html-to-text") as HtmlToTextModule

function collectText(node: HtmlToTextNode | undefined): string {
    if (!node) return ""
    if (node.type === "text") {
        return node.data ?? ""
    }

    return (node.children ?? []).map((child) => collectText(child)).join("")
}

function quoteYaml(value: string) {
    return JSON.stringify(value)
}

function resolveUrl(href: string, baseUrl: string) {
    try {
        return new URL(href, baseUrl).toString()
    } catch {
        return href
    }
}

function extractTitle(html: string) {
    const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)
    return match?.[1]
        ?.replace(/\s+/g, " ")
        .trim()
}

function extractDescription(html: string) {
    const metaTag = html.match(/<meta\b[^>]*>/gi)?.find((tag) => /name=["']description["']/i.test(tag))
    const content = metaTag?.match(/content=["']([\s\S]*?)["']/i)?.[1]

    return content
        ?.replace(/\s+/g, " ")
        .trim()
}

const convertHtmlToMarkdown = compile({
    baseElements: {
        orderBy: "selectors",
        returnDomByDefault: true,
        selectors: ["main", "article"],
    },
    formatters: {
        markdownAnchor(elem: HtmlToTextElement, walk: HtmlToTextWalk, builder: HtmlToTextBuilder) {
            const href = elem.attribs?.href?.trim()
            if (!href) {
                walk(elem.children, builder)
                return
            }

            const resolvedHref = resolveUrl(href, builder.metadata?.baseUrl ?? "")
            const text = collectText(elem).trim()

            if (!text) {
                builder.addInline(resolvedHref)
                return
            }

            builder.addInline("[")
            walk(elem.children, builder)
            builder.addInline(`](${resolvedHref})`)
        },
        markdownHeading(
            elem: HtmlToTextElement,
            walk: HtmlToTextWalk,
            builder: HtmlToTextBuilder,
            formatOptions: { level?: number },
        ) {
            const level = Math.min(Math.max(formatOptions.level ?? 1, 1), 6)

            builder.openBlock({ leadingLineBreaks: 2 })
            builder.addInline(`${"#".repeat(level)} `)
            walk(elem.children, builder)
            builder.closeBlock({ trailingLineBreaks: 2 })
        },
        markdownPre(elem: HtmlToTextElement, _walk: HtmlToTextWalk, builder: HtmlToTextBuilder) {
            const code = collectText(elem).replace(/\r\n/g, "\n").trimEnd()

            builder.openBlock({ leadingLineBreaks: 2 })
            builder.addInline(`\`\`\`\n${code}\n\`\`\``)
            builder.closeBlock({ trailingLineBreaks: 2 })
        },
    },
    preserveNewlines: true,
    selectors: [
        { selector: "script", format: "skip" },
        { selector: "style", format: "skip" },
        { selector: "svg", format: "skip" },
        { selector: "noscript", format: "skip" },
        { selector: "nav", format: "skip" },
        { selector: "footer", format: "skip" },
        { selector: "aside", format: "skip" },
        { selector: "dialog", format: "skip" },
        { selector: "img", format: "skip" },
        { selector: "a", format: "markdownAnchor" },
        { selector: "h1", format: "markdownHeading", options: { level: 1 } },
        { selector: "h2", format: "markdownHeading", options: { level: 2 } },
        { selector: "h3", format: "markdownHeading", options: { level: 3 } },
        { selector: "h4", format: "markdownHeading", options: { level: 4 } },
        { selector: "h5", format: "markdownHeading", options: { level: 5 } },
        { selector: "h6", format: "markdownHeading", options: { level: 6 } },
        { selector: "pre", format: "markdownPre" },
        { selector: "ul", options: { itemPrefix: "- " } },
    ],
    wordwrap: false,
})

function normalizeMarkdown(markdown: string) {
    return markdown
        .replace(/\u00a0/g, " ")
        .replace(/[ \t]+\n/g, "\n")
        .replace(/\n{4,}/g, "\n\n\n")
        .trim()
}

function estimateTokenCount(markdown: string) {
    return Math.max(1, Math.ceil(markdown.length / 4))
}

export function renderMarkdownDocument(html: string, url: string): MarkdownDocument {
    const title = extractTitle(html)
    const description = extractDescription(html)
    const body = normalizeMarkdown(convertHtmlToMarkdown(html, { baseUrl: url }))

    const frontmatter = [
        "---",
        ...(title ? [`title: ${quoteYaml(title)}`] : []),
        `url: ${quoteYaml(url)}`,
        ...(description ? [`description: ${quoteYaml(description)}`] : []),
        "---",
    ].join("\n")

    const markdown = `${frontmatter}\n\n${body || "Content unavailable."}\n`

    return {
        markdown,
        tokens: estimateTokenCount(markdown),
    }
}
