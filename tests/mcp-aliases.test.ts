/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js"
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { personalScope } from "@/lib/ownership"

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
            { scope: "anon.li:aliases", quota: "alias", rateLimit: "api" },
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
            { scope: "anon.li:aliases", quota: "alias", checkBan: "alias", rateLimit: "aliasCreate" },
            expect.any(Function),
        )
        expect(createAlias).toHaveBeenCalledWith(personalScope("user-1"), {
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
        expect(createAlias).toHaveBeenCalledWith(personalScope("user-1"), expect.objectContaining({
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
        expect(resolveAlias).toHaveBeenCalledWith("old@anon.li", personalScope("user-1"))
        expect(toggleAlias).toHaveBeenCalledWith(personalScope("user-1"), "a4")
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
        expect(deleteAlias).toHaveBeenCalledWith(personalScope("user-1"), "a5")
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

/**
 * End-to-end-ish coverage: a real SDK McpServer + Client over an in-memory
 * transport, so the JSON Schema advertised to MCP clients and the SDK's
 * input validation are exercised for real. Only the service/data layer is
 * mocked (via the vi.mock calls above).
 */
describe("MCP alias tools over a real in-memory transport", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        invokeTool.mockImplementation(async (_session, _opts, handler) => handler({
            id: "user-1",
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeCurrentPeriodEnd: null,
        }))
    })

    async function connectClient(): Promise<Client> {
        const server = new McpServer({ name: "anon.li-test", version: "0.0.0" })
        const { registerAliasTools } = await import("@/lib/mcp/tools/aliases")
        registerAliasTools(server, session)
        const client = new Client({ name: "test-client", version: "0.0.0" })
        const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair()
        await Promise.all([server.connect(serverTransport), client.connect(clientTransport)])
        return client
    }

    it("advertises the server-side local_part pattern in the create_alias JSON schema", async () => {
        const client = await connectClient()
        try {
            const { tools } = await client.listTools()
            const create = tools.find((t) => t.name === "create_alias")!
            const props = create.inputSchema.properties as Record<string, { maxLength?: number, pattern?: string }>
            expect(props.local_part).toBeDefined()
            expect(props.local_part!.maxLength).toBe(64)
            // Must match LOCAL_PART_PATTERN from lib/validations/alias.ts
            expect(props.local_part!.pattern).toBe("^[a-z0-9]+(\\.[a-z0-9]+)*$")
        } finally {
            await client.close()
        }
    })

    it("rejects invalid local_parts at the schema boundary before AliasService is reached", async () => {
        const client = await connectClient()
        try {
            const invalid = ["bad-name", "under_score", ".leading", "trailing.", "double..dot", "UPPER", "spa ce"]
            for (const local_part of invalid) {
                // The SDK client surfaces the -32602 input-validation error as an
                // isError result; the point is the service layer is never reached.
                const out = await client.callTool({
                    name: "create_alias",
                    arguments: { format: "custom", local_part },
                })
                expect(out.isError).toBe(true)
                const text = (out.content as Array<{ text?: string }>).map((c) => c.text ?? "").join(" ")
                expect(text).toContain("Invalid arguments for tool create_alias")
                expect(text).toContain("lowercase letters, numbers, and single dots only")
            }
            expect(createAlias).not.toHaveBeenCalled()
        } finally {
            await client.close()
        }
    })

    it("round trip: create a throwaway alias, delete it via delete_alias, confirm via list_aliases", async () => {
        const createdAt = new Date("2026-07-01T00:00:00Z")
        const throwaway = {
            id: "tmp-1",
            email: "throwaway123@anon.li",
            active: true,
            createdAt,
            updatedAt: createdAt,
        }
        createAlias.mockResolvedValueOnce(throwaway)
        getAliases
            .mockResolvedValueOnce([{
                ...throwaway,
                emailsReceived: 0,
                emailsBlocked: 0,
                lastEmailAt: null,
                encryptedLabel: null,
                encryptedNote: null,
            }])
            .mockResolvedValueOnce([])
        resolveAlias.mockResolvedValueOnce({ id: "tmp-1", email: "throwaway123@anon.li" })
        deleteAlias.mockResolvedValueOnce(undefined)

        const client = await connectClient()
        try {
            // 1. create
            const created = await client.callTool({
                name: "create_alias",
                arguments: { format: "custom", local_part: "throwaway123" },
            })
            expect(created.isError).toBeFalsy()
            expect((created.structuredContent as Record<string, unknown>).email).toBe("throwaway123@anon.li")

            // 2. shows up in the list
            const before = await client.callTool({ name: "list_aliases", arguments: {} })
            const beforeAliases = (before.structuredContent as { aliases: { email: string }[] }).aliases
            expect(beforeAliases.map((a) => a.email)).toContain("throwaway123@anon.li")

            // 3. delete via the MCP tool, addressing it by email
            const deleted = await client.callTool({
                name: "delete_alias",
                arguments: { id: "throwaway123@anon.li" },
            })
            expect(deleted.isError).toBeFalsy()
            expect((deleted.structuredContent as Record<string, unknown>).deleted).toBe(true)
            expect(resolveAlias).toHaveBeenCalledWith("throwaway123@anon.li", personalScope("user-1"))
            expect(deleteAlias).toHaveBeenCalledWith(personalScope("user-1"), "tmp-1")

            // 4. gone from the list
            const after = await client.callTool({ name: "list_aliases", arguments: {} })
            const afterContent = after.structuredContent as { total: number, aliases: unknown[] }
            expect(afterContent.total).toBe(0)
            expect(afterContent.aliases).toEqual([])
        } finally {
            await client.close()
        }
    })

    it("delete_alias keeps its destructive annotation and documents the approval requirement", async () => {
        const client = await connectClient()
        try {
            const { tools } = await client.listTools()
            const del = tools.find((t) => t.name === "delete_alias")!
            expect(del.annotations).toMatchObject({ destructiveHint: true })
            expect(del.description).toContain("No approval received")
        } finally {
            await client.close()
        }
    })
})
