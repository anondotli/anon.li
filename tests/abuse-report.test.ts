/**
 * @vitest-environment node
 *
 * The abuse endpoints are public + unauthenticated, so their input validation
 * and rate-limit gates are the security boundary. This covers the report-status
 * lookup (token validation + per-IP throttle) and the report-intake gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const { rateLimit, checkRateLimit, getClientIp, abuseReportFindUnique } = vi.hoisted(() => ({
    rateLimit: vi.fn(),
    checkRateLimit: vi.fn(),
    getClientIp: vi.fn().mockResolvedValue("203.0.113.5"),
    abuseReportFindUnique: vi.fn(),
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit,
    checkRateLimit,
    getClientIp,
    rateLimiters: { reportStatus: {}, reportAbuse: {} },
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        abuseReport: { findUnique: abuseReportFindUnique, findFirst: vi.fn(), create: vi.fn() },
        drop: { findUnique: vi.fn() },
        alias: { findUnique: vi.fn() },
        form: { findUnique: vi.fn() },
    },
}))

vi.mock("@/lib/turnstile", () => ({ validateTurnstileToken: vi.fn().mockResolvedValue(true) }))
vi.mock("@/lib/report-crypto", () => ({ encryptReportKey: vi.fn((k: string) => `enc:${k}`) }))
vi.mock("resend", () => ({ Resend: class { emails = { send: vi.fn() } } }))
vi.mock("@/components/email/report-confirmation", () => ({ ReportConfirmationEmail: () => null }))

describe("GET /api/abuse/status", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getClientIp.mockResolvedValue("203.0.113.5")
        checkRateLimit.mockResolvedValue(null)
    })

    it("rejects a malformed tracking token with 400", async () => {
        const { GET } = await import("@/app/api/abuse/status/route")
        const res = await GET(new Request("http://localhost/api/abuse/status?token=short"))
        expect(res.status).toBe(400)
        expect(abuseReportFindUnique).not.toHaveBeenCalled()
    })

    it("returns the limiter response when the per-IP limit is exceeded", async () => {
        checkRateLimit.mockResolvedValue(
            NextResponse.json({ error: "Too many requests" }, { status: 429 })
        )
        const { GET } = await import("@/app/api/abuse/status/route")
        const token = "a".repeat(32)
        const res = await GET(new Request(`http://localhost/api/abuse/status?token=${token}`))
        expect(res.status).toBe(429)
        // Throttled before any DB lookup.
        expect(abuseReportFindUnique).not.toHaveBeenCalled()
    })

    it("returns 404 for a well-formed but unknown token", async () => {
        abuseReportFindUnique.mockResolvedValue(null)
        const { GET } = await import("@/app/api/abuse/status/route")
        const token = "b".repeat(32)
        const res = await GET(new Request(`http://localhost/api/abuse/status?token=${token}`))
        expect(res.status).toBe(404)
    })

    it("returns the report status for a known token", async () => {
        abuseReportFindUnique.mockResolvedValue({ status: "reviewing", createdAt: new Date("2026-01-01") })
        const { GET } = await import("@/app/api/abuse/status/route")
        const token = "c".repeat(32)
        const res = await GET(new Request(`http://localhost/api/abuse/status?token=${token}`))
        expect(res.status).toBe(200)
        expect(await res.json()).toMatchObject({ status: "reviewing" })
    })
})

describe("POST /api/abuse", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getClientIp.mockResolvedValue("203.0.113.5")
        rateLimit.mockResolvedValue(null)
    })

    it("returns the limiter response when the per-IP report limit is hit", async () => {
        rateLimit.mockResolvedValue(NextResponse.json({ error: "Too many requests" }, { status: 429 }))
        const { POST } = await import("@/app/api/abuse/route")
        const res = await POST(
            new Request("http://localhost/api/abuse", {
                method: "POST",
                body: JSON.stringify({}),
                headers: { "content-type": "application/json" },
            })
        )
        expect(res.status).toBe(429)
    })

    it("rejects an invalid report body with 400", async () => {
        const { POST } = await import("@/app/api/abuse/route")
        const res = await POST(
            new Request("http://localhost/api/abuse", {
                method: "POST",
                // missing required fields / too-short description
                body: JSON.stringify({ serviceType: "drop", resourceId: "x", reason: "spam", description: "too short" }),
                headers: { "content-type": "application/json" },
            })
        )
        expect(res.status).toBe(400)
    })
})
