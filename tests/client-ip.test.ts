/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { headerValues } = vi.hoisted(() => ({
    headerValues: new Map<string, string>(),
}))

vi.mock("next/headers", () => ({
    headers: vi.fn(async () => ({
        get: (name: string) => headerValues.get(name.toLowerCase()) ?? null,
    })),
}))

const originalEnv = process.env

async function loadClientIp(): Promise<() => Promise<string>> {
    vi.resetModules()
    return (await import("@/lib/rate-limit")).getClientIp
}

describe("getClientIp trusted proxy handling", () => {
    beforeEach(() => {
        headerValues.clear()
        process.env = {
            ...originalEnv,
            NODE_ENV: "production",
            UPSTASH_REDIS_REST_URL: "https://redis.invalid",
            UPSTASH_REDIS_REST_TOKEN: "test-token",
        }
        delete process.env.VERCEL
        delete process.env.TRUSTED_PROXY_PROVIDER
    })

    afterEach(() => {
        process.env = originalEnv
        vi.resetModules()
    })

    it("prefers Vercel's edge-owned header over a spoofable Cloudflare header", async () => {
        process.env.VERCEL = "1"
        headerValues.set("x-vercel-forwarded-for", "203.0.113.8")
        headerValues.set("cf-connecting-ip", "198.51.100.99")

        const getClientIp = await loadClientIp()
        await expect(getClientIp()).resolves.toBe("203.0.113.8")
    })

    it("accepts Cloudflare's header only after explicit proxy configuration", async () => {
        process.env.TRUSTED_PROXY_PROVIDER = "cloudflare"
        headerValues.set("cf-connecting-ip", "2001:db8::8")

        const getClientIp = await loadClientIp()
        await expect(getClientIp()).resolves.toBe("2001:db8::8")
    })

    it("fails closed when production has no trusted proxy configuration", async () => {
        headerValues.set("cf-connecting-ip", "203.0.113.9")
        headerValues.set("x-forwarded-for", "203.0.113.10")

        const getClientIp = await loadClientIp()
        await expect(getClientIp()).rejects.toThrow("trusted proxy")
    })

    it("rejects malformed addresses from the configured edge", async () => {
        process.env.TRUSTED_PROXY_PROVIDER = "cloudflare"
        headerValues.set("cf-connecting-ip", "not-an-ip")

        const getClientIp = await loadClientIp()
        await expect(getClientIp()).rejects.toThrow("invalid client IP")
    })
})
