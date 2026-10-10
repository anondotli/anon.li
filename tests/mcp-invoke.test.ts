/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getAuthUserState = vi.fn()
const checkApiQuota = vi.fn()
const findUnique = vi.fn()
const aliasCreateLimit = vi.fn()

vi.mock("@/lib/data/auth", () => ({ getAuthUserState }))

vi.mock("@/lib/api-rate-limit", () => ({ checkApiQuota }))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique },
    },
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimiters: {
        aliasCreate: { limit: aliasCreateLimit },
        api: null,
    },
}))

const baseUser = {
    id: "user-1",
    banned: false,
    isAdmin: false,
    stripeSubscriptionId: null,
    stripePriceId: null,
    stripeCurrentPeriodEnd: null,
}

/** Extract the machine-readable error payload from a failed tool result. */
function errorMeta(result: unknown) {
    return (result as { _meta: { "anon.li/error": Record<string, unknown> } })._meta["anon.li/error"]
}

function resultText(result: unknown) {
    return (result as { content: Array<{ text: string }> }).content[0]!.text
}

describe("invokeTool", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getAuthUserState.mockResolvedValue(baseUser)
        findUnique.mockResolvedValue({ banFileUpload: false, banAliasCreation: false })
        checkApiQuota.mockResolvedValue({
            success: true,
            limit: 500,
            remaining: 499,
            reset: new Date("2026-05-01T00:00:00.000Z"),
        })
        aliasCreateLimit.mockResolvedValue({ success: true, limit: 60, remaining: 59, reset: Date.now() + 60_000 })
    })

    it("invokes the handler with the resolved user when all checks pass", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn().mockResolvedValue("ok")

        const result = await invokeTool(
            { userId: "user-1", clientId: "client-1" },
            { quota: "alias", rateLimit: "aliasCreate" },
            handler,
        )

        expect(result).toBe("ok")
        expect(handler).toHaveBeenCalledWith(expect.objectContaining({ id: "user-1" }))
        expect(checkApiQuota).toHaveBeenCalledWith("user-1", baseUser, "alias")
        expect(aliasCreateLimit).toHaveBeenCalledWith("user-1")
    })

    it("runs the handler when the token carries the required scope", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn().mockResolvedValue("ok")
        await expect(
            invokeTool(
                { userId: "user-1", clientId: "c", scopes: "anon.li:aliases anon.li:drops offline_access" },
                { scope: "anon.li:drops" },
                handler,
            ),
        ).resolves.toBe("ok")
        expect(handler).toHaveBeenCalled()
    })

    // Business failures come back as isError tool results, not thrown McpErrors:
    // the SDK flattens any thrown McpError into a bare message string, so the
    // structured `data` payload never reaches the client. A result keeps it.
    it("returns INSUFFICIENT_SCOPE when the token lacks the required scope", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn()
        const out = await invokeTool(
            { userId: "user-1", clientId: "c", scopes: "anon.li:aliases offline_access" },
            { scope: "anon.li:forms" },
            handler,
        )
        expect(out).toMatchObject({ isError: true })
        expect(errorMeta(out)).toMatchObject({
            code: "INSUFFICIENT_SCOPE",
            required_scope: "anon.li:forms",
            granted_scopes: ["anon.li:aliases", "offline_access"],
        })
        expect(handler).not.toHaveBeenCalled()
        expect(checkApiQuota).not.toHaveBeenCalled()
    })

    it("fails closed for a scoped tool when the token has no scopes at all", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn()
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, { scope: "anon.li:aliases" }, handler)
        expect(errorMeta(out)).toMatchObject({ code: "INSUFFICIENT_SCOPE" })
        expect(handler).not.toHaveBeenCalled()
    })

    it("rejects when the user no longer exists", async () => {
        getAuthUserState.mockResolvedValueOnce(null)
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn()
        const out = await invokeTool({ userId: "ghost", clientId: "c" }, {}, handler)
        expect(errorMeta(out)).toMatchObject({ code: "ACCOUNT_NOT_ACTIVE" })
        expect(handler).not.toHaveBeenCalled()
    })

    it("rejects banned accounts before doing anything else", async () => {
        getAuthUserState.mockResolvedValueOnce({ ...baseUser, banned: true, banReason: "Abuse" })
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn()
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, { quota: "alias" }, handler)
        expect(errorMeta(out)).toMatchObject({ code: "ACCOUNT_BANNED", message: "Abuse" })
        expect(handler).not.toHaveBeenCalled()
        expect(checkApiQuota).not.toHaveBeenCalled()
    })

    it("rejects alias creation when the user is banned from creating aliases", async () => {
        findUnique.mockResolvedValueOnce({ banFileUpload: false, banAliasCreation: true })
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn()
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, { checkBan: "alias" }, handler)
        expect(errorMeta(out)).toMatchObject({ code: "BAN_ALIAS_CREATION" })
        expect(handler).not.toHaveBeenCalled()
    })

    it("rejects upload tools when the user is banned from uploads", async () => {
        findUnique.mockResolvedValueOnce({ banFileUpload: true, banAliasCreation: false })
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, { checkBan: "upload" }, async () => 1)
        expect(errorMeta(out)).toMatchObject({ code: "BAN_FILE_UPLOAD" })
    })

    it("returns the structured QUOTA_EXCEEDED error when the monthly quota is exhausted", async () => {
        checkApiQuota.mockResolvedValueOnce({
            success: false,
            limit: 500,
            remaining: 0,
            reset: new Date("2026-05-01T00:00:00.000Z"),
        })
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn()
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, { quota: "alias" }, handler)
        expect(errorMeta(out)).toMatchObject({
            code: "QUOTA_EXCEEDED",
            quota_type: "alias",
            limit: 500,
            remaining: 0,
            reset_at: "2026-05-01T00:00:00.000Z",
        })
        // The text block is what most agent loops actually read, so the payload
        // must be legible there too — not just in _meta.
        expect(resultText(out)).toContain("QUOTA_EXCEEDED")
        expect(resultText(out)).toContain("2026-05-01T00:00:00.000Z")
        expect(handler).not.toHaveBeenCalled()
    })

    it("returns RATE_LIMITED when the per-tool limiter rejects", async () => {
        const reset = Date.now() + 30_000
        aliasCreateLimit.mockResolvedValueOnce({ success: false, limit: 60, remaining: 0, reset })
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, { rateLimit: "aliasCreate" }, async () => 1)
        expect(errorMeta(out)).toMatchObject({ code: "RATE_LIMITED", reset_at: new Date(reset).toISOString() })
    })

    it("does not fail closed when the limiter throws (Redis outage)", async () => {
        aliasCreateLimit.mockRejectedValueOnce(new Error("ECONNREFUSED"))
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn().mockResolvedValue("served")
        await expect(
            invokeTool({ userId: "user-1", clientId: "c" }, { rateLimit: "aliasCreate" }, handler),
        ).resolves.toBe("served")
        expect(handler).toHaveBeenCalled()
    })

    it("normalizes NotFoundError thrown by the handler", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const { NotFoundError } = await import("@/lib/api-error-utils")
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, {}, async () => {
            throw new NotFoundError("Alias not found")
        })
        expect(errorMeta(out)).toMatchObject({ code: "NOT_FOUND", message: "Alias not found" })
    })

    it("normalizes ValidationError", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const { ValidationError } = await import("@/lib/api-error-utils")
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, {}, async () => {
            throw new ValidationError("local part required")
        })
        expect(errorMeta(out)).toMatchObject({ code: "VALIDATION_ERROR" })
    })

    it("normalizes ForbiddenError", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const { ForbiddenError } = await import("@/lib/api-error-utils")
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, {}, async () => {
            throw new ForbiddenError("nope")
        })
        expect(errorMeta(out)).toMatchObject({ code: "FORBIDDEN" })
    })

    it("normalizes UpgradeRequiredError with its tier details", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const { UpgradeRequiredError } = await import("@/lib/api-error-utils")
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, {}, async () => {
            throw new UpgradeRequiredError("Alias limit reached", {
                scope: "alias_random",
                currentTier: "free",
                suggestedTier: "plus",
                currentValue: 10,
                limitValue: 50,
            })
        })
        expect(errorMeta(out)).toMatchObject({
            code: "UPGRADE_REQUIRED",
            upgrade: { scope: "alias_random", suggestedTier: "plus" },
        })
    })

    it("hides unexpected handler errors behind a generic INTERNAL_ERROR", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const out = await invokeTool({ userId: "user-1", clientId: "c" }, {}, async () => {
            throw new Error("jdbc: connection pool exhausted // secret DSN")
        })
        expect(errorMeta(out)).toMatchObject({ code: "INTERNAL_ERROR" })
        expect(resultText(out)).not.toContain("connection pool")
    })

    it("still propagates ProtocolError as a protocol error", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const { ProtocolError, ProtocolErrorCode } = await import("@modelcontextprotocol/server")
        await expect(
            invokeTool({ userId: "user-1", clientId: "c" }, {}, async () => {
                throw new ProtocolError(ProtocolErrorCode.MethodNotFound, "nope")
            }),
        ).rejects.toBeInstanceOf(ProtocolError)
    })
})

describe("toolResult", () => {
    it("produces a content block plus structuredContent mirror", async () => {
        const { toolResult } = await import("@/lib/mcp/invoke")
        const out = toolResult({ id: "abc", count: 3 })
        expect(out.content).toEqual([
            { type: "text", text: JSON.stringify({ id: "abc", count: 3 }, null, 2) },
        ])
        expect(out.structuredContent).toEqual({ id: "abc", count: 3 })
    })
})
