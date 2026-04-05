const DROP_KEY_PATTERN = /^[A-Za-z0-9_-]{43}$/

export function normalizeDropKeyInput(input: string): string | null {
    const trimmed = input.trim()
    if (!trimmed) return null

    if (DROP_KEY_PATTERN.test(trimmed)) {
        return trimmed
    }

    try {
        const asUrl = new URL(trimmed)
        const fragment = asUrl.hash.startsWith("#") ? asUrl.hash.slice(1) : asUrl.hash
        return DROP_KEY_PATTERN.test(fragment) ? fragment : null
    } catch {
        // Not a full URL, continue with lightweight parsing below.
    }

    if (trimmed.includes("#")) {
        const fragment = trimmed.split("#").pop() ?? ""
        return DROP_KEY_PATTERN.test(fragment) ? fragment : null
    }

    return null
}
