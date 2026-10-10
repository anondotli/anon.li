import { describe, expect, it, vi } from "vitest"
import type { Redis } from "@upstash/redis"
import { isLoopbackRedisUrl, withStockRedisScripts } from "@/lib/local-redis"

describe("isLoopbackRedisUrl", () => {
    it.each(["http://localhost:8079", "http://127.0.0.1:8079", "http://[::1]:8079"])("matches %s", (url) => {
        expect(isLoopbackRedisUrl(url)).toBe(true)
    })

    it.each([undefined, "", "https://strong-eel-15419.upstash.io", "http://localhost.evil.test", "nope"])(
        "rejects %s",
        (url) => {
            expect(isLoopbackRedisUrl(url)).toBe(false)
        },
    )
})

describe("withStockRedisScripts", () => {
    function fakeRedis() {
        return {
            eval: vi.fn(async () => [1, 2]),
            evalsha: vi.fn(async () => [9, 9]),
            get: vi.fn(async (key: string) => `value:${key}`),
        }
    }

    it("forces the eval fallback with a NOSCRIPT error", async () => {
        const raw = fakeRedis()
        const wrapped = withStockRedisScripts(raw as unknown as Redis)
        await expect(wrapped.evalsha("abc", ["k"], [1])).rejects.toThrow(/NOSCRIPT/)
        expect(raw.evalsha).not.toHaveBeenCalled()
    })

    it("strips the Upstash-only shebang before eval", async () => {
        const raw = fakeRedis()
        const wrapped = withStockRedisScripts(raw as unknown as Redis)
        const script = "#!lua flags=allow-key-locking\nlocal key = KEYS[1]\nreturn 1"
        await expect(wrapped.eval(script, ["k"], [1])).resolves.toEqual([1, 2])
        expect(raw.eval).toHaveBeenCalledWith("local key = KEYS[1]\nreturn 1", ["k"], [1])
    })

    it("passes every other command through", async () => {
        const raw = fakeRedis()
        const wrapped = withStockRedisScripts(raw as unknown as Redis)
        await expect(wrapped.get("x")).resolves.toBe("value:x")
    })
})
