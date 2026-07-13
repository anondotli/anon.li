import { parse } from "yaml"

const MAX_FRONTMATTER_LENGTH = 64 * 1024
const OPENING_DELIMITER = /^---[\t ]*\r?\n/
const CLOSING_DELIMITER = /^(?:---|\.\.\.)[\t ]*\r?$/gm

export interface ParsedFrontmatter {
    data: Record<string, unknown>
    content: string
}

/**
 * Parse the repository's Markdown/MDX YAML frontmatter without pulling in the
 * abandoned gray-matter -> js-yaml 3 dependency chain. Delimiters must be at
 * column zero, so an indented `---` inside a YAML block scalar is not mistaken
 * for the end of the document.
 */
export function parseFrontmatter(input: string): ParsedFrontmatter {
    const source = input.charCodeAt(0) === 0xFEFF ? input.slice(1) : input
    const opening = OPENING_DELIMITER.exec(source)
    if (!opening) return { data: {}, content: source }

    CLOSING_DELIMITER.lastIndex = opening[0].length
    const closing = CLOSING_DELIMITER.exec(source)
    if (!closing) {
        throw new Error("Frontmatter is missing a closing delimiter")
    }

    const yamlSource = source.slice(opening[0].length, closing.index)
    if (yamlSource.length > MAX_FRONTMATTER_LENGTH) {
        throw new Error("Frontmatter exceeds the 64 KiB limit")
    }

    const parsed = parse(yamlSource, { maxAliasCount: 50 }) as unknown
    if (parsed !== null && (typeof parsed !== "object" || Array.isArray(parsed))) {
        throw new Error("Frontmatter must be a YAML mapping")
    }

    let contentStart = closing.index + closing[0].length
    if (source.startsWith("\r\n", contentStart)) contentStart += 2
    else if (source.startsWith("\n", contentStart)) contentStart += 1

    return {
        data: (parsed ?? {}) as Record<string, unknown>,
        content: source.slice(contentStart),
    }
}
