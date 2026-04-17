/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getAliases = vi.fn()
const createAlias = vi.fn()
const toggleAlias = vi.fn()
const deleteAlias = vi.fn()
const resolveAlias = vi.fn()

const invokeTool = vi.fn(async (_session, _opts, handler) => handler({
    id: "user-1",
    stripeSubscriptionId: null,
    stripePriceId: null,
    stripeCurrentPeriodEnd: null,
}))

vi.mock("@/lib/services/alias", () => ({
    AliasService: { getAliases, createAlias, toggleAlias, deleteAlias },
}))

vi.mock("@/app/api/v1/alias/_utils", () => ({
    resolveAlias,
    toAddyFormat: (a: { id: string, email: string, active: boolean, createdAt: Date, updatedAt: Date }) => ({
        id: a.id,
        email: a.email,
        active: a.active,
        created_at: a.createdAt.toISOString(),
        updated_at: a.updatedAt.toISOString(),
    }),
}))

vi.mock("@/lib/mcp/invoke", () => ({
    invokeTool,
    toolResult: <T,>(data: T) => ({
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        structuredContent: data as Record<string, unknown>,
    }),
}))

interface FakeMcpServer {
    tools: Map<string, { schema: unknown, handler: (args: Record<string, unknown>) => Promise<unknown> }>
    registerTool: (
        name: string,
        meta: { inputSchema?: unknown },
        handler: (args: Record<string, unknown>) => Promise<unknown>,
    ) => void
}

function makeServer(): FakeMcpServer {
    const tools = new Map()
    return {
        tools,
        registerTool(name, meta, handler) {
            tools.set(name, { schema: meta.inputSchema, handler })
        },
    }
}

const session = { userId: "user-1", clientId: "client-1" }

describe("MCP alias tools", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        invokeTool.mockImplementation(async (_session, _opts, handler) => handler({
            id: "user-1",
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
        }))
    })

    it("list_aliases counts against the alias quota and never leaks vault-encrypted fields", async () => {
        getAliases.mockResolvedValueOnce([
            {
                id: "a1",
                email: "x@anon.li",
                active: true,
                createdAt: new Date("2026-04-01T00:00:00Z"),
                updatedAt: new Date("2026-04-02T00:00:00Z"),
                emailsReceived: 7,
                emailsBlocked: 1,
                lastEmailAt: new Date("2026-04-15T12:00:00Z"),
                encryptedLabel: "secret-label-cipher",
                encryptedNote: "secret-note-cipher",
            },
        ])

        const server = makeServer()
        const { registerAliasTools } = await import("@/lib/mcp/tools/aliases")
        registerAliasTools(server as never, session)

        const tool = server.tools.get("list_aliases")!
        const out = (await tool.handler({})) as { structuredContent: { aliases: unknown[] } }

        expect(invokeTool).toHaveBeenCalledWith(
            session,
            { quota: "alias", rateLimit: "api" },
            expect.any(Function),
        )
        const alias = out.structuredContent.aliases[0] as Record<string, unknown>
        expect(alias.id).toBe("a1")
        expect(alias.encrypted_label).toBeUndefined()
        expect(alias.encrypted_note).toBeUndefined()
        expect(alias.emails_received).toBe(7)
        expect(alias.emails_blocked).toBe(1)
    })

    it("create_alias forwards format/local_part to AliasService and applies ban+rate-limit policy", async () => {
        createAlias.mockResolvedValueOnce({
            id: "a2",
            email: "custom@anon.li",
            active: true,
            createdAt: new Date("2026-04-17T00:00:00Z"),
            updatedAt: new Date("2026-04-17T00:00:00Z"),
        })

        const server = makeServer()
        const { registerAliasTools } = await import("@/lib/mcp/tools/aliases")
        registerAliasTools(server as never, session)

        const tool = server.tools.get("create_alias")!
        await tool.handler({
            domain: "anon.li",
            format: "custom",
            local_part: "custom",
            recipient_ids: ["r1"],
        })

        expect(invokeTool).toHaveBeenCalledWith(
            session,
            { quota: "alias", checkBan: "alias", rateLimit: "aliasCreate" },
            expect.any(Function),
        )
        expect(createAlias).toHaveBeenCalledWith("user-1", {
            domain: "anon.li",
            format: "CUSTOM",
            localPart: "custom",
            recipientIds: ["r1"],
            recipientEmail: undefined,
        })
    })

    it("create_alias passes localPart undefined when format is random", async () => {
        createAlias.mockResolvedValueOnce({
            id: "a3",
            email: "rand@anon.li",
            active: true,
            createdAt: new Date(),
            updatedAt: new Date(),
        })
        const server = makeServer()
        const { registerAliasTools } = await import("@/lib/mcp/tools/aliases")
        registerAliasTools(server as never, session)
        await server.tools.get("create_alias")!.handler({ domain: "anon.li", format: "random" })
        expect(createAlias).toHaveBeenCalledWith("user-1", expect.objectContaining({
            format: "RANDOM",
            localPart: undefined,
        }))
    })

    it("toggle_alias resolves by id-or-email and returns the updated state", async () => {
        resolveAlias.mockResolvedValueOnce({ id: "a4", email: "old@anon.li" })
        toggleAlias.mockResolvedValueOnce({ id: "a4", email: "old@anon.li", active: false })

        const server = makeServer()
        const { registerAliasTools } = await import("@/lib/mcp/tools/aliases")
        registerAliasTools(server as never, session)

        const out = (await server.tools.get("toggle_alias")!.handler({ id: "old@anon.li" })) as {
            structuredContent: { active: boolean }
        }
        expect(resolveAlias).toHaveBeenCalledWith("old@anon.li", "user-1")
        expect(toggleAlias).toHaveBeenCalledWith("user-1", "a4")
        expect(out.structuredContent.active).toBe(false)
    })

    it("toggle_alias returns an isError result when the alias is unknown", async () => {
        resolveAlias.mockResolvedValueOnce(null)
        const server = makeServer()
        const { registerAliasTools } = await import("@/lib/mcp/tools/aliases")
        registerAliasTools(server as never, session)
        const out = (await server.tools.get("toggle_alias")!.handler({ id: "missing" })) as {
            isError: boolean
        }
        expect(out.isError).toBe(true)
        expect(toggleAlias).not.toHaveBeenCalled()
    })

    it("delete_alias resolves and deletes by id", async () => {
        resolveAlias.mockResolvedValueOnce({ id: "a5", email: "kill@anon.li" })
        deleteAlias.mockResolvedValueOnce(undefined)
        const server = makeServer()
        const { registerAliasTools } = await import("@/lib/mcp/tools/aliases")
        registerAliasTools(server as never, session)

        const out = (await server.tools.get("delete_alias")!.handler({ id: "a5" })) as {
            structuredContent: { deleted: boolean }
        }
        expect(deleteAlias).toHaveBeenCalledWith("user-1", "a5")
        expect(out.structuredContent.deleted).toBe(true)
    })

    it("propagates QUOTA_EXCEEDED from invokeTool to the caller", async () => {
        invokeTool.mockImplementationOnce(async () => {
            throw Object.assign(new Error("Monthly API quota exceeded"), {
                code: -32002,
                data: { code: "QUOTA_EXCEEDED" },
            })
        })
        const server = makeServer()
        const { registerAliasTools } = await import("@/lib/mcp/tools/aliases")
        registerAliasTools(server as never, session)
        await expect(server.tools.get("list_aliases")!.handler({})).rejects.toMatchObject({
            data: { code: "QUOTA_EXCEEDED" },
        })
    })
})
