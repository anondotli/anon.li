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

    it("rejects when the user no longer exists", async () => {
        getAuthUserState.mockResolvedValueOnce(null)
        const { invokeTool } = await import("@/lib/mcp/invoke")
        await expect(
            invokeTool({ userId: "ghost", clientId: "c" }, {}, async () => 1),
        ).rejects.toMatchObject({ message: expect.stringContaining("Account") })
    })

    it("rejects banned accounts before doing anything else", async () => {
        getAuthUserState.mockResolvedValueOnce({ ...baseUser, banned: true })
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn()
        await expect(
            invokeTool({ userId: "user-1", clientId: "c" }, { quota: "alias" }, handler),
        ).rejects.toMatchObject({ data: { code: "ACCOUNT_BANNED" } })
        expect(handler).not.toHaveBeenCalled()
        expect(checkApiQuota).not.toHaveBeenCalled()
    })

    it("rejects alias creation when the user is banned from creating aliases", async () => {
        findUnique.mockResolvedValueOnce({ banFileUpload: false, banAliasCreation: true })
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn()
        await expect(
            invokeTool({ userId: "user-1", clientId: "c" }, { checkBan: "alias" }, handler),
        ).rejects.toMatchObject({ data: { code: "BAN_ALIAS_CREATION" } })
        expect(handler).not.toHaveBeenCalled()
    })

    it("rejects upload tools when the user is banned from uploads", async () => {
        findUnique.mockResolvedValueOnce({ banFileUpload: true, banAliasCreation: false })
        const { invokeTool } = await import("@/lib/mcp/invoke")
        await expect(
            invokeTool({ userId: "user-1", clientId: "c" }, { checkBan: "upload" }, async () => 1),
        ).rejects.toMatchObject({ data: { code: "BAN_FILE_UPLOAD" } })
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
        await expect(
            invokeTool({ userId: "user-1", clientId: "c" }, { quota: "alias" }, handler),
        ).rejects.toMatchObject({
            data: {
                code: "QUOTA_EXCEEDED",
                quotaType: "alias",
                limit: 500,
                remaining: 0,
                resetAt: "2026-05-01T00:00:00.000Z",
            },
        })
        expect(handler).not.toHaveBeenCalled()
    })

    it("returns RATE_LIMITED when the per-tool limiter rejects", async () => {
        const reset = Date.now() + 30_000
        aliasCreateLimit.mockResolvedValueOnce({ success: false, limit: 60, remaining: 0, reset })
        const { invokeTool } = await import("@/lib/mcp/invoke")
        await expect(
            invokeTool(
                { userId: "user-1", clientId: "c" },
                { rateLimit: "aliasCreate" },
                async () => 1,
            ),
        ).rejects.toMatchObject({ data: { code: "RATE_LIMITED" } })
    })

    it("does not fail closed when the limiter throws (Redis outage)", async () => {
        aliasCreateLimit.mockRejectedValueOnce(new Error("ECONNREFUSED"))
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const handler = vi.fn().mockResolvedValue("served")
        await expect(
            invokeTool(
                { userId: "user-1", clientId: "c" },
                { rateLimit: "aliasCreate" },
                handler,
            ),
        ).resolves.toBe("served")
        expect(handler).toHaveBeenCalled()
    })

    it("normalizes NotFoundError thrown by the handler", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const { NotFoundError } = await import("@/lib/api-error-utils")
        await expect(
            invokeTool({ userId: "user-1", clientId: "c" }, {}, async () => {
                throw new NotFoundError("Alias not found")
            }),
        ).rejects.toMatchObject({ code: -32004, data: { code: "NOT_FOUND" } })
    })

    it("normalizes ValidationError to InvalidParams", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const { ValidationError } = await import("@/lib/api-error-utils")
        await expect(
            invokeTool({ userId: "user-1", clientId: "c" }, {}, async () => {
                throw new ValidationError("local part required")
            }),
        ).rejects.toMatchObject({ code: -32602 })
    })

    it("normalizes ForbiddenError to FORBIDDEN", async () => {
        const { invokeTool } = await import("@/lib/mcp/invoke")
        const { ForbiddenError } = await import("@/lib/api-error-utils")
        await expect(
            invokeTool({ userId: "user-1", clientId: "c" }, {}, async () => {
                throw new ForbiddenError("nope")
            }),
        ).rejects.toMatchObject({ code: -32001 })
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
