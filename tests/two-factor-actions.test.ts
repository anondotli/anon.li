/**
 * @vitest-environment node
 */
import { createHash } from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const getSession = vi.fn()
const verifyTOTP = vi.fn()
const verifyBackupCode = vi.fn()
const rateLimit = vi.fn()
const headers = vi.fn()
const cookies = vi.fn()
const sessionUpdate = vi.fn()
const revalidatePath = vi.fn()

vi.mock("@/auth", () => ({
    auth: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
    auth: {
        api: {
            getSession,
            verifyTOTP,
            verifyBackupCode,
        },
    },
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit,
}))

vi.mock("next/headers", () => ({
    headers,
    cookies,
}))

vi.mock("next/cache", () => ({
    revalidatePath,
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        session: {
            update: sessionUpdate,
        },
    },
}))

vi.mock("@/lib/services/two-factor", () => ({
    TwoFactorService: {},
}))

function createCookieStore(cookieValue?: string) {
    return {
        get: vi.fn((name: string) => {
            if (name === "better-auth.two_factor" && cookieValue) {
                return { value: cookieValue }
            }
            return undefined
        }),
        delete: vi.fn(),
    }
}

describe("verifyTwoFactorLogin", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        headers.mockResolvedValue(new Headers({ cookie: "better-auth.two_factor=signed-pending-token" }))
        cookies.mockResolvedValue(createCookieStore("signed-pending-token"))
        rateLimit.mockResolvedValue(null)
        sessionUpdate.mockResolvedValue({})
    })

    it("verifies a pending email/password 2FA login without an existing session", async () => {
        getSession.mockResolvedValue(null)
        verifyTOTP.mockResolvedValue({ token: "new-session-token" })

        const { verifyTwoFactorLogin } = await import("@/actions/two-factor")
        const result = await verifyTwoFactorLogin("123456", "totp")

        const pendingRateLimitId = `pending:${createHash("sha256").update("signed-pending-token").digest("base64url")}`
        expect(result).toEqual({ success: true })
        expect(rateLimit).toHaveBeenCalledWith("twoFactorVerify", pendingRateLimitId)
        expect(verifyTOTP).toHaveBeenCalledWith({
            body: { code: "123456" },
            headers: expect.any(Headers),
        })
        expect(sessionUpdate).toHaveBeenCalledWith({
            where: { token: "new-session-token" },
            data: { twoFactorVerified: true },
        })
    })

    it("keeps supporting unverified sessions from OAuth or magic-link flows", async () => {
        getSession.mockResolvedValue({
            session: { id: "session-1", token: "existing-session-token" },
            user: { id: "user-1", twoFactorEnabled: true },
        })
        verifyBackupCode.mockResolvedValue({ token: "existing-session-token" })

        const { verifyTwoFactorLogin } = await import("@/actions/two-factor")
        const result = await verifyTwoFactorLogin("ABCDE-12345678901", "backup")

        expect(result).toEqual({ success: true })
        expect(rateLimit).toHaveBeenCalledWith("twoFactorVerify", "user-1")
        expect(verifyBackupCode).toHaveBeenCalledWith({
            body: { code: "ABCDE-12345678901" },
            headers: expect.any(Headers),
        })
        expect(sessionUpdate).toHaveBeenCalledWith({
            where: { id: "session-1" },
            data: { twoFactorVerified: true },
        })
    })

    it("rejects missing sessions without a pending two-factor cookie", async () => {
        getSession.mockResolvedValue(null)
        cookies.mockResolvedValue(createCookieStore())

        const { verifyTwoFactorLogin } = await import("@/actions/two-factor")
        const result = await verifyTwoFactorLogin("123456", "totp")

        expect(result).toEqual({ error: "Not authenticated" })
        expect(verifyTOTP).not.toHaveBeenCalled()
        expect(sessionUpdate).not.toHaveBeenCalled()
    })
})
