import type { Redis } from "@upstash/redis"

const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]", "::1"])

/** Whether the Upstash REST URL points at a local stand-in (compose.yml). */
export function isLoopbackRedisUrl(url: string | undefined): boolean {
    if (!url) return false
    try {
        return LOOPBACK_HOSTS.has(new URL(url).hostname.toLowerCase())
    } catch {
        return false
    }
}

const LUA_SHEBANG = /^#!lua[^\n]*\n/

/**
 * Adapts @upstash/ratelimit's scripts to stock Redis. Its Lua carries an
 * Upstash-only `#!lua flags=allow-key-locking` shebang that Redis rejects, so
 * the script hash it tries first can never be loaded. Failing `evalsha` with
 * NOSCRIPT makes the library fall back to `eval`, which gets the body without
 * the shebang. The scripts declare all their keys, so they run unchanged.
 * Local development only — never wrap a real Upstash endpoint.
 */
export function withStockRedisScripts(client: Redis): Redis {
    return new Proxy(client, {
        get(target, prop, receiver) {
            if (prop === "evalsha") {
                return async () => {
                    throw new Error("NOSCRIPT local Redis stand-in: send the script body")
                }
            }
            if (prop === "eval") {
                return (script: string, keys: string[], args: unknown[]) =>
                    target.eval(script.replace(LUA_SHEBANG, ""), keys, args)
            }
            const value: unknown = Reflect.get(target, prop, receiver)
            return typeof value === "function" ? value.bind(target) : value
        },
    })
}
