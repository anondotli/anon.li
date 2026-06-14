import { type ClassValue, clsx } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
    return twMerge(clsx(inputs))
}

export function sanitizeEmailSubject(input: string, maxLength: number = 100): string {
    let sanitized = input.replace(/[\r\n]/g, " ")
    sanitized = sanitized.replace(/\0/g, "")
    sanitized = sanitized.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    sanitized = sanitized.replace(/\s+/g, " ").trim()

    if (sanitized.length > maxLength) {
        sanitized = sanitized.substring(0, maxLength - 3) + "..."
    }

    return sanitized
}

// Word joiner (U+2060): invisible and non-breaking — splitting an auto-linkable
// token with it stops mail clients from rendering it as a link, without
// visibly changing the text.
const WORD_JOINER = "\u2060"

/**
 * Sanitize user-controlled text (team names, display names) for rendering in
 * outbound email. On top of subject-style cleanup it strips invisible/bidi
 * characters and defangs auto-linkable patterns — mail clients turn anything
 * that looks like a domain, URL, or address ("anon.li", "http://…", "a@b.com")
 * into a clickable link, which would let the author of the text plant a
 * phishing link inside a trusted anon.li email. Defense-in-depth behind the
 * org-name policy in lib/validations/organization.ts.
 */
export function sanitizeEmailUserContent(input: string, maxLength: number = 60): string {
    let sanitized = sanitizeEmailSubject(input, maxLength)
    // Invisible & bidi formatting chars (zero-width spaces/joiners, LRO/RLO, BOM).
    sanitized = sanitized.replace(/[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]/g, "")
    // Defang: "anon.li" → "anon.\u2060li", "http://x" → "http:\u2060//x", "a@b" → "a@\u2060b".
    sanitized = sanitized.replace(/\.(?=[\p{L}\p{N}])/gu, "." + WORD_JOINER)
    sanitized = sanitized.replace(/:\/\//g, ":" + WORD_JOINER + "//")
    sanitized = sanitized.replace(/@(?=[\p{L}\p{N}])/gu, "@" + WORD_JOINER)
    return sanitized
}

export function sanitizeFilename(filename: string, maxLength: number = 255): string {
    let sanitized = filename.replace(/\.\./g, "")
    sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, "")
    sanitized = sanitized.replace(/[<>:"/\\|?*]/g, "_")
    sanitized = sanitized.replace(/_+/g, "_")
    sanitized = sanitized.replace(/^[_\s]+|[_\s]+$/g, "")

    if (sanitized.length > maxLength) {
        const lastDot = sanitized.lastIndexOf(".")
        if (lastDot > 0 && lastDot > sanitized.length - 10) {
            const ext = sanitized.substring(lastDot)
            const name = sanitized.substring(0, maxLength - ext.length - 3)
            sanitized = name + "..." + ext
        } else {
            sanitized = sanitized.substring(0, maxLength - 3) + "..."
        }
    }

    if (!sanitized) {
        sanitized = "unnamed"
    }

    return sanitized
}

export function sanitizeDomain(domain: string): string {
    let sanitized = domain.toLowerCase().trim()
    sanitized = sanitized.replace(/^https?:\/\//, "")
    sanitized = sanitized.split("/")[0] || ""
    sanitized = sanitized.split(":")[0] || ""
    sanitized = sanitized.replace(/[^a-z0-9.-]/g, "")
    sanitized = sanitized.replace(/^[.-]+|[.-]+$/g, "")

    return sanitized
}
