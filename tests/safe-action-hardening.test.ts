/** @vitest-environment node */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"

const { auth, getAuthUserState, getOrganizationSuspension, rateLimit, logError } = vi.hoisted(() => ({
    auth: vi.fn(),
    getAuthUserState: vi.fn(),
    getOrganizationSuspension: vi.fn(),
    rateLimit: vi.fn(),
    logError: vi.fn(),
}))

vi.mock("@/auth", () => ({ auth }))
vi.mock("@/lib/data/auth", () => ({ getAuthUserState, getOrganizationSuspension }))
vi.mock("@/lib/rate-limit", () => ({ rateLimit, rateLimiters: {} }))
vi.mock("@/lib/logger", () => ({ logError }))

import { runAdminAction, runScopedAction } from "@/lib/safe-action"
import {
    ConflictError,
    ForbiddenError,
    NotFoundError,
    ServiceUnavailableError,
    UpgradeRequiredError,
    ValidationError,
} from "@/lib/api-error-utils"

function session(overrides: { twoFactorEnabled?: boolean; twoFactorVerified?: boolean } = {}) {
    return {
        user: { id: "u1", twoFactorEnabled: overrides.twoFactorEnabled ?? true },
        twoFactorVerified: overrides.twoFactorVerified ?? true,
        activeOrganizationId: null,
        activeOrgRole: null,
        activeOrgEnforce2FA: false,
    }
}

beforeEach(() => {
    vi.clearAllMocks()
    auth.mockResolvedValue(session())
    getAuthUserState.mockResolvedValue({ id: "u1", isAdmin: true, banned: false })
    rateLimit.mockResolvedValue(null)
})

describe("runAdminAction — admin is 2FA-enforced", () => {
    it("rejects an admin who has not enrolled 2FA", async () => {
        auth.mockResolvedValue(session({ twoFactorEnabled: false }))
        const handler = vi.fn()

        const result = await runAdminAction({}, handler)

        expect(result).toEqual({ error: "Two-factor authentication required" })
        expect(handler).not.toHaveBeenCalled()
    })

    it("rejects an enrolled admin whose session is not 2FA-verified", async () => {
        auth.mockResolvedValue(session({ twoFactorEnabled: true, twoFactorVerified: false }))
        const handler = vi.fn()

        expect(await runAdminAction({}, handler)).toEqual({ error: "Two-factor authentication required" })
        expect(handler).not.toHaveBeenCalled()
    })

    it("runs for an enrolled, verified admin", async () => {
        const result = await runAdminAction({}, async () => "ok")
        expect(result).toEqual({ success: true, data: "ok" })
    })
})

describe("runScopedAction — user-facing error mapping", () => {
    const run = (error: unknown) => runScopedAction({}, async () => { throw error })

    it.each([
        ["ConflictError", new ConflictError("Alias already taken")],
        ["ForbiddenError", new ForbiddenError("Custom domains are available on Plus and Pro plans")],
        ["NotFoundError", new NotFoundError("Domain not found")],
        ["ValidationError", new ValidationError("Invalid local part")],
        ["ServiceUnavailableError", new ServiceUnavailableError("Storage is temporarily unavailable")],
    ])("returns the message of a typed %s", async (_name, error) => {
        const apiError = error as Error & { code?: string }
        expect(await run(error)).toEqual(
            apiError.code ? { error: apiError.message, code: apiError.code } : { error: apiError.message },
        )
    })

    it("keeps the upgrade payload for UpgradeRequiredError", async () => {
        const details = { scope: "alias_domains" as const, currentTier: "free" as const, suggestedTier: "plus" as const }
        expect(await run(new UpgradeRequiredError("Upgrade to add domains", details))).toEqual({
            error: "Upgrade to add domains",
            code: "UPGRADE_REQUIRED",
            upgrade: details,
        })
    })

    it("maps a Prisma unique violation (P2002) to a generic conflict message", async () => {
        const error = new Prisma.PrismaClientKnownRequestError("Unique constraint failed on users_email_key", {
            code: "P2002",
            clientVersion: "test",
        })
        expect(await run(error)).toEqual({ error: "That already exists" })
    })

    it("maps a Prisma serialization conflict (P2034) to a retry message", async () => {
        const error = new Prisma.PrismaClientKnownRequestError("Transaction failed due to a write conflict", {
            code: "P2034",
            clientVersion: "test",
        })
        expect(await run(error)).toEqual({ error: "Please try again" })
    })

    it("hides unexpected errors and logs them", async () => {
        expect(await run(new Error("connect ECONNREFUSED 10.0.0.5:5432"))).toEqual({ error: "Operation failed" })
        expect(logError).toHaveBeenCalled()
    })
})
