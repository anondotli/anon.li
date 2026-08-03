export function parseHttpsOrLoopbackHttpUrl(value: unknown): URL | null {
    if (typeof value !== "string" || value.length < 1 || value.length > 2_048) return null

    let url: URL
    try {
        url = new URL(value)
    } catch {
        return null
    }

    if (url.username || url.password) return null
    if (url.protocol === "https:") return url
    if (url.protocol !== "http:") return null

    const hostname = url.hostname.toLowerCase()
    const loopback = hostname === "localhost"
        || hostname.endsWith(".localhost")
        || hostname === "127.0.0.1"
        || hostname === "[::1]"

    return loopback ? url : null
}

export function parseHttpsUrl(value: unknown): URL | null {
    const url = parseHttpsOrLoopbackHttpUrl(value)
    return url?.protocol === "https:" ? url : null
}
