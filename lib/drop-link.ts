const DROP_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/
const RECIPIENT_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/

export interface ParsedDropShareFragment {
    key: string | null
    recipientToken: string | null
}

/**
 * Parse both legacy `#<key>` links and structured
 * `#k=<key>&r=<recipient-token>` recipient links. Keeping bearer material in
 * the fragment prevents it from reaching reverse proxies, request logs, and
 * server-side analytics while still letting the browser authorize explicitly.
 */
export function parseDropShareFragment(fragment: string): ParsedDropShareFragment {
    const value = fragment.startsWith("#") ? fragment.slice(1) : fragment
    if (!value) return { key: null, recipientToken: null }

    if (DROP_KEY_PATTERN.test(value)) {
        return { key: value, recipientToken: null }
    }

    const params = new URLSearchParams(value)
    const key = params.get("k")
    const recipientToken = params.get("r")

    return {
        key: key && DROP_KEY_PATTERN.test(key) ? key : null,
        recipientToken: recipientToken && RECIPIENT_TOKEN_PATTERN.test(recipientToken)
            ? recipientToken
            : null,
    }
}

export function normalizeDropKeyInput(input: string): string | null {
    const trimmed = input.trim()
    if (!trimmed) return null

    if (DROP_KEY_PATTERN.test(trimmed)) {
        return trimmed
    }

    try {
        const asUrl = new URL(trimmed)
        const fragment = asUrl.hash.startsWith("#") ? asUrl.hash.slice(1) : asUrl.hash
        return parseDropShareFragment(fragment).key
    } catch {
        // Not a full URL, continue with lightweight parsing below.
    }

    if (trimmed.includes("#")) {
        const fragment = trimmed.split("#").pop() ?? ""
        return parseDropShareFragment(fragment).key
    }

    return null
}
