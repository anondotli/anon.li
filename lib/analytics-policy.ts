const ANALYTICS_DISABLED_PATH_PREFIXES = [
    "/2fa",
    "/admin",
    "/api",
    "/d",
    "/dashboard",
    "/drop",
    "/login",
    "/register",
    "/reset",
    "/setup",
    "/verify-recipient",
] as const

function matchesPathPrefix(pathname: string, prefix: string): boolean {
    return pathname === prefix || pathname.startsWith(`${prefix}/`)
}

export function shouldEnableAnalytics(pathname: string): boolean {
    return !ANALYTICS_DISABLED_PATH_PREFIXES.some((prefix) => matchesPathPrefix(pathname, prefix))
}
