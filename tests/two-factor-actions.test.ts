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
const userSecurityFindUnique = vi.fn()
const getVaultSchemaState = vi.fn()
const twoFactorIsEnabled = vi.fn()

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
        userSecurity: {
            findUnique: userSecurityFindUnique,
        },
    },
}))

vi.mock("@/lib/vault/schema", () => ({
    getVaultSchemaState,
}))

vi.mock("@/lib/services/two-factor", () => ({
    TwoFactorService: {
        isEnabled: twoFactorIsEnabled,
    },
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
        sessionUpdate.mockResolvedValue({ userId: "user-1" })
        userSecurityFindUnique.mockResolvedValue({ id: "security-1" })
        getVaultSchemaState.mockResolvedValue({ userSecurity: true, dropOwnerKeys: true })
        twoFactorIsEnabled.mockResolvedValue(true)
    })

    it("verifies a pending email/password 2FA login without an existing session", async () => {
        getSession.mockResolvedValue(null)
        verifyTOTP.mockResolvedValue({ token: "new-session-token" })

        const { verifyTwoFactorLogin } = await import("@/actions/two-factor")
        const result = await verifyTwoFactorLogin("123456", "totp")

        const pendingRateLimitId = `pending:${createHash("sha256").update("signed-pending-token").digest("base64url")}`
        expect(result).toEqual({ success: true, redirectTo: "/dashboard/alias" })
        expect(rateLimit).toHaveBeenCalledWith("twoFactorVerify", pendingRateLimitId)
        expect(verifyTOTP).toHaveBeenCalledWith({
            body: { code: "123456" },
            headers: expect.any(Headers),
        })
        expect(sessionUpdate).toHaveBeenCalledWith({
            where: { token: "new-session-token" },
            data: { twoFactorVerified: true },
            select: { userId: true },
        })
        expect(userSecurityFindUnique).toHaveBeenCalledWith({
            where: { userId: "user-1" },
            select: { id: true },
        })
    })

    it("redirects to /setup when the user has no vault security record", async () => {
        getSession.mockResolvedValue(null)
        verifyTOTP.mockResolvedValue({ token: "new-session-token" })
        userSecurityFindUnique.mockResolvedValue(null)

        const { verifyTwoFactorLogin } = await import("@/actions/two-factor")
        const result = await verifyTwoFactorLogin("123456", "totp")

        expect(result).toEqual({ success: true, redirectTo: "/setup" })
    })

    it("keeps supporting unverified sessions from OAuth or magic-link flows", async () => {
        getSession.mockResolvedValue({
            session: { id: "session-1", token: "existing-session-token" },
            user: { id: "user-1", twoFactorEnabled: true },
        })
        verifyBackupCode.mockResolvedValue({ token: "existing-session-token" })

        const { verifyTwoFactorLogin } = await import("@/actions/two-factor")
        const result = await verifyTwoFactorLogin("ABCDE-12345678901", "backup")

        expect(result).toEqual({ success: true, redirectTo: "/dashboard/alias" })
        expect(rateLimit).toHaveBeenCalledWith("twoFactorVerify", "user-1")
        expect(verifyBackupCode).toHaveBeenCalledWith({
            body: { code: "ABCDE-12345678901" },
            headers: expect.any(Headers),
        })
        expect(sessionUpdate).toHaveBeenCalledWith({
            where: { id: "session-1" },
            data: { twoFactorVerified: true },
            select: { userId: true },
        })
    })

    it("rejects existing sessions when 2FA is no longer enabled", async () => {
        getSession.mockResolvedValue({
            session: { id: "session-1", token: "existing-session-token" },
            user: { id: "user-1" },
        })
        twoFactorIsEnabled.mockResolvedValue(false)

        const { verifyTwoFactorLogin } = await import("@/actions/two-factor")
        const result = await verifyTwoFactorLogin("123456", "totp")

        expect(result).toEqual({ error: "2FA is not enabled" })
        expect(rateLimit).not.toHaveBeenCalled()
        expect(verifyTOTP).not.toHaveBeenCalled()
        expect(sessionUpdate).not.toHaveBeenCalled()
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
