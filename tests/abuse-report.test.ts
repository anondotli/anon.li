/**
 * @vitest-environment node
 *
 * The abuse endpoints are public + unauthenticated, so their input validation
 * and rate-limit gates are the security boundary. This covers the report-status
 * lookup (token validation + per-IP throttle) and the report-intake gate.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"
import { NextResponse } from "next/server"

const {
    rateLimit,
    checkRateLimit,
    getClientIp,
    abuseReportFindUnique,
    abuseReportFindFirst,
    abuseReportCreate,
    dropFindUnique,
    aliasFindFirst,
    formFindUnique,
    sendAbuseReportNotificationEmail,
} = vi.hoisted(() => ({
    rateLimit: vi.fn(),
    checkRateLimit: vi.fn(),
    getClientIp: vi.fn().mockResolvedValue("203.0.113.5"),
    abuseReportFindUnique: vi.fn(),
    abuseReportFindFirst: vi.fn(),
    abuseReportCreate: vi.fn(),
    dropFindUnique: vi.fn(),
    aliasFindFirst: vi.fn(),
    formFindUnique: vi.fn(),
    sendAbuseReportNotificationEmail: vi.fn().mockResolvedValue({ success: true }),
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit,
    checkRateLimit,
    getClientIp,
    rateLimiters: { reportStatus: {}, reportAbuse: {}, reportAbusePerResource: {} },
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        abuseReport: {
            findUnique: abuseReportFindUnique,
            findFirst: abuseReportFindFirst,
            create: abuseReportCreate,
        },
        drop: { findUnique: dropFindUnique },
        alias: { findFirst: aliasFindFirst },
        form: { findUnique: formFindUnique },
    },
}))

vi.mock("@/lib/turnstile", () => ({ validateTurnstileToken: vi.fn().mockResolvedValue(true) }))
vi.mock("@/lib/report-crypto", () => ({ encryptReportKey: vi.fn((k: string) => `enc:${k}`) }))
vi.mock("resend", () => ({ Resend: class { emails = { send: vi.fn() } } }))
vi.mock("@/components/email/report-confirmation", () => ({ ReportConfirmationEmail: () => null }))
vi.mock("@/lib/resend", () => ({ sendAbuseReportNotificationEmail }))

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
        expect(res.headers.get("Cache-Control")).toBe("private, no-store")
        expect(await res.json()).toMatchObject({ status: "reviewing" })
    })
})

describe("POST /api/abuse", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getClientIp.mockResolvedValue("203.0.113.5")
        rateLimit.mockResolvedValue(null)
        checkRateLimit.mockResolvedValue(null)
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

    it("rejects malformed JSON with 400", async () => {
        const { POST } = await import("@/app/api/abuse/route")
        const res = await POST(
            new Request("http://localhost/api/abuse", {
                method: "POST",
                body: "{",
                headers: { "content-type": "application/json" },
            }),
        )
        expect(res.status).toBe(400)
    })

    it("deduplicates and rate-limits within the resource type namespace", async () => {
        dropFindUnique.mockResolvedValue({ id: "shared-id", takenDown: false, disabled: false })
        abuseReportFindFirst.mockResolvedValue(null)
        abuseReportCreate.mockResolvedValue({ id: "report-1" })

        const { POST } = await import("@/app/api/abuse/route")
        const res = await POST(
            new Request("http://localhost/api/abuse", {
                method: "POST",
                body: JSON.stringify({
                    serviceType: "drop",
                    resourceId: "shared-id",
                    reason: "spam",
                    description: "This is a sufficiently detailed abuse report.",
                    turnstileToken: "verified-token",
                }),
                headers: { "content-type": "application/json" },
            }),
        )

        expect(res.status).toBe(200)
        expect(res.headers.get("Cache-Control")).toBe("private, no-store")
        expect(abuseReportFindFirst).toHaveBeenCalledWith({
            where: expect.objectContaining({
                reporterIp: expect.any(String),
                serviceType: "drop",
                resourceId: "shared-id",
            }),
            select: { id: true },
        })
        expect(checkRateLimit).toHaveBeenCalledWith({}, "resource:drop:shared-id")
    })
})

describe("POST /api/abuse auto-resolve", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getClientIp.mockResolvedValue("203.0.113.5")
        rateLimit.mockResolvedValue(null)
        checkRateLimit.mockResolvedValue(null)
        abuseReportFindFirst.mockResolvedValue(null)
        abuseReportCreate.mockResolvedValue({ id: "report-1" })
    })

    async function report(serviceType: "drop" | "alias" | "form", resourceId: string) {
        const { POST } = await import("@/app/api/abuse/route")
        const res = await POST(
            new Request("http://localhost/api/abuse", {
                method: "POST",
                body: JSON.stringify({
                    serviceType,
                    resourceId,
                    reason: "spam",
                    description: "This is a sufficiently detailed abuse report.",
                    turnstileToken: "verified-token",
                }),
                headers: { "content-type": "application/json" },
            }),
        )
        expect(res.status).toBe(200)
        return abuseReportCreate.mock.calls[0]![0].data.status as string
    }

    it("keeps a report pending when the owner merely paused their drop", async () => {
        dropFindUnique.mockResolvedValue({ takenDown: false })
        expect(await report("drop", "drop-1")).toBe("pending")
        expect(dropFindUnique).toHaveBeenCalledWith(expect.objectContaining({ select: { takenDown: true } }))
    })

    it("auto-resolves a report for a drop staff already took down", async () => {
        dropFindUnique.mockResolvedValue({ takenDown: true })
        expect(await report("drop", "drop-1")).toBe("resolved")
    })

    it("keeps a report pending for an alias the owner deactivated", async () => {
        aliasFindFirst.mockResolvedValue({ takenDownAt: null })
        expect(await report("alias", "x@anon.li")).toBe("pending")
        expect(aliasFindFirst).toHaveBeenCalledWith(expect.objectContaining({ select: { takenDownAt: true } }))
    })

    it("auto-resolves a report for an alias staff already took down", async () => {
        aliasFindFirst.mockResolvedValue({ takenDownAt: new Date() })
        expect(await report("alias", "x@anon.li")).toBe("resolved")
    })

    it("keeps a report pending for a form the owner disabled or deleted", async () => {
        formFindUnique.mockResolvedValue({ takenDown: false })
        expect(await report("form", "form-1")).toBe("pending")
        expect(formFindUnique).toHaveBeenCalledWith(expect.objectContaining({ select: { takenDown: true } }))
    })

    it("auto-resolves a report for a form staff already took down", async () => {
        formFindUnique.mockResolvedValue({ takenDown: true })
        expect(await report("form", "form-1")).toBe("resolved")
    })
})

describe("POST /api/abuse staff notification", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        vi.unstubAllEnvs()
        vi.stubEnv("EMAIL_FROM_DOMAIN", "")
        getClientIp.mockResolvedValue("203.0.113.5")
        rateLimit.mockResolvedValue(null)
        checkRateLimit.mockResolvedValue(null)
        abuseReportFindFirst.mockResolvedValue(null)
        abuseReportCreate.mockResolvedValue({ id: "report-1" })
        sendAbuseReportNotificationEmail.mockResolvedValue({ success: true })
    })

    async function submit() {
        const { POST } = await import("@/app/api/abuse/route")
        return POST(
            new Request("http://localhost/api/abuse", {
                method: "POST",
                body: JSON.stringify({
                    serviceType: "drop",
                    resourceId: "https://anon.li/d/drop-1#secret-key",
                    reason: "malware",
                    description: "This is a sufficiently detailed abuse report.",
                    contactEmail: "reporter@example.com",
                    decryptionKey: "secret-key",
                    turnstileToken: "verified-token",
                }),
                headers: { "content-type": "application/json" },
            }),
        )
    }

    it("alerts hi@anon.li with only the report's enum fields and resource id", async () => {
        dropFindUnique.mockResolvedValue({ id: "drop-1", takenDown: false, disabled: false })

        const res = await submit()

        expect(res.status).toBe(200)
        expect(sendAbuseReportNotificationEmail).toHaveBeenCalledTimes(1)
        // Exact payload: no description, reporter contact or decryption key.
        expect(sendAbuseReportNotificationEmail).toHaveBeenCalledWith("hi@anon.li", {
            serviceType: "drop",
            resourceId: "drop-1",
            reason: "malware",
            priority: "urgent",
        })
    })

    it("alerts hi@ on a configured sender domain", async () => {
        vi.stubEnv("EMAIL_FROM_DOMAIN", "mail.example.dev")
        dropFindUnique.mockResolvedValue({ id: "drop-1", takenDown: false, disabled: false })

        const res = await submit()

        expect(res.status).toBe(200)
        expect(sendAbuseReportNotificationEmail).toHaveBeenCalledWith("hi@mail.example.dev", expect.any(Object))
    })

    it("sends no alert for a report auto-resolved by an existing takedown", async () => {
        dropFindUnique.mockResolvedValue({ id: "drop-1", takenDown: true, disabled: false })

        const res = await submit()

        expect(res.status).toBe(200)
        expect(sendAbuseReportNotificationEmail).not.toHaveBeenCalled()
    })

    it("still accepts the report when the alert fails to send", async () => {
        dropFindUnique.mockResolvedValue({ id: "drop-1", takenDown: false, disabled: false })
        sendAbuseReportNotificationEmail.mockResolvedValue({ success: false, error: new Error("resend down") })

        const res = await submit()

        expect(res.status).toBe(200)
        expect(abuseReportCreate).toHaveBeenCalledTimes(1)
    })
})
