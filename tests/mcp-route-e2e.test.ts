/**
 * @vitest-environment node
 *
 * End-to-end coverage of `/api/mcp`: the real route handler, the real
 * better-auth `withMcpAuth` wrapper, the real `invokeTool` gate and the real
 * tool registrations, driven by the official SDK client over Streamable HTTP.
 * Only the persistence layer (services, Prisma, Redis) is mocked.
 *
 * The official client validates every `structuredContent` against the tool's
 * declared `outputSchema`, so any drift between a handler and its schema fails
 * here the same way it fails in Claude.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Client } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js"

const getMcpSession = vi.fn()

vi.mock("@/lib/auth", () => ({
    auth: {
        options: { baseURL: "https://anon.li", basePath: "/api/auth" },
        api: { getMcpSession },
    },
}))

vi.mock("@/lib/posthog.server", () => ({
    getPostHogClient: () => null,
    flushPostHog: async () => {},
}))

vi.mock("next/server", () => ({ after: () => {} }))

const getAuthUserState = vi.fn()
vi.mock("@/lib/data/auth", () => ({ getAuthUserState }))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: {
            findUnique: vi.fn(async () => ({ banFileUpload: false, banAliasCreation: false })),
        },
    },
}))

vi.mock("@/lib/api-rate-limit", () => ({
    checkApiQuota: vi.fn(async () => ({
        success: true,
        limit: 1000,
        remaining: 999,
        reset: new Date("2026-11-01T00:00:00.000Z"),
    })),
}))

vi.mock("@/lib/rate-limit", () => {
    const limiter = { limit: vi.fn(async () => ({ success: true, reset: Date.now() + 60_000 })) }
    return {
        rateLimiters: new Proxy({}, { get: () => limiter }),
    }
})

const aliasRow = {
    id: "alias-1",
    email: "jane.doe@anon.li",
    active: true,
    emailsReceived: 3,
    emailsBlocked: 1,
    lastEmailAt: new Date("2026-10-01T00:00:00.000Z"),
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    updatedAt: new Date("2026-09-02T00:00:00.000Z"),
    // Vault/legacy columns that must never reach structuredContent.
    label: "legacy label",
    note: "legacy note",
    encryptedLabel: "ciphertext",
    encryptedNote: "ciphertext",
    userId: "user-1",
    organizationId: null,
}

const AliasService = {
    getAliases: vi.fn(async () => [aliasRow]),
    countAliases: vi.fn(async () => 1),
    createAlias: vi.fn(async () => aliasRow),
    toggleAlias: vi.fn(async () => ({ ...aliasRow, active: false })),
    deleteAlias: vi.fn(async () => aliasRow),
}
vi.mock("@/lib/services/alias", () => ({ AliasService }))

const resolveAlias = vi.fn(async (identifier: string) =>
    identifier === aliasRow.id || identifier === aliasRow.email ? aliasRow : null)
vi.mock("@/app/api/v1/alias/_utils", () => ({ resolveAlias }))

const RecipientService = {
    getRecipients: vi.fn(async () => [{
        id: "rcpt-1",
        email: "me@example.com",
        verified: true,
        isDefault: true,
        pgpFingerprint: null,
        pgpPublicKey: null,
        createdAt: new Date("2026-08-01T00:00:00.000Z"),
    }]),
    addRecipient: vi.fn(async () => ({
        id: "rcpt-2",
        email: "new@example.com",
        verified: false,
        isDefault: false,
        createdAt: new Date("2026-10-01T00:00:00.000Z"),
    })),
}
vi.mock("@/lib/services/recipient", () => ({ RecipientService }))

const DropService = {
    listDrops: vi.fn(async () => ({
        total: 1,
        drops: [{
            id: "drop1234",
            encryptedTitle: "ciphertext",
            iv: "iv",
            downloads: 2,
            maxDownloads: null,
            expiresAt: null,
            customKey: false,
            hideBranding: false,
            disabled: false,
            takenDown: false,
            takedownReason: null,
            uploadComplete: true,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            files: [],
            fileCount: 1,
            totalSize: "1024",
        }],
    })),
    toggleDrop: vi.fn(async () => true),
    deleteDrop: vi.fn(async () => {}),
}
vi.mock("@/lib/services/drop", () => ({ DropService }))

const FormService = {
    listForms: vi.fn(async () => ({
        total: 1,
        forms: [{
            id: "form1234",
            title: "Contact",
            description: null,
            active: true,
            disabledByUser: false,
            takenDown: false,
            allowFileUploads: false,
            submissionsCount: 4,
            maxSubmissions: null,
            closesAt: null,
            hideBranding: false,
            notifyOnSubmission: true,
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            updatedAt: new Date("2026-09-02T00:00:00.000Z"),
        }],
    })),
    toggleForm: vi.fn(async () => true),
    deleteForm: vi.fn(async () => {}),
}
vi.mock("@/lib/services/form", () => ({ FormService }))

const ALL_SCOPES = "anon.li:aliases anon.li:drops anon.li:forms offline_access"
const MCP_URL = "https://anon.li/api/mcp"

async function route() {
    return import("@/app/api/mcp/route")
}

/** fetch() that dispatches straight into the Next.js route handlers. */
async function routeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init)
    const handlers = await route()
    switch (request.method) {
        case "POST": return handlers.POST(request)
        case "GET": return handlers.GET(request)
        case "DELETE": return handlers.DELETE(request)
        case "OPTIONS": return handlers.OPTIONS(request)
        default: return new Response(null, { status: 405 })
    }
}

async function connectClient() {
    const client = new Client({ name: "e2e-client", version: "0.0.0" })
    const transport = new StreamableHTTPClientTransport(new URL(MCP_URL), {
        fetch: routeFetch,
        requestInit: { headers: { Authorization: "Bearer test-token" } },
    })
    await client.connect(transport)
    return client
}

function rpc(body: unknown, headers: Record<string, string> = {}) {
    return routeFetch(MCP_URL, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json, text/event-stream",
            Authorization: "Bearer test-token",
            "MCP-Protocol-Version": LATEST_PROTOCOL_VERSION,
            ...headers,
        },
        body: typeof body === "string" ? body : JSON.stringify(body),
    })
}

describe("/api/mcp end to end", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getMcpSession.mockResolvedValue({ userId: "user-1", clientId: "client-1", scopes: ALL_SCOPES })
        getAuthUserState.mockResolvedValue({
            banned: false,
            banReason: null,
            banAliasCreation: false,
            banFileUpload: false,
            subscriptions: [],
        })
    })

    it("initializes with server info, instructions, and the tools capability", async () => {
        const client = await connectClient()
        expect(client.getServerVersion()).toEqual({ name: "anon.li", version: expect.any(String) })
        expect(client.getServerCapabilities()?.tools).toBeDefined()
        expect(client.getInstructions()).toContain("zero-knowledge")
        await client.close()
    })

    it("lists every tool with a title, annotations.title, and explicit safety hints", async () => {
        const client = await connectClient()
        const { tools } = await client.listTools()
        expect(tools.map((tool) => tool.name).sort()).toEqual([
            "add_recipient",
            "create_alias",
            "delete_alias",
            "delete_drop",
            "delete_form",
            "list_aliases",
            "list_drops",
            "list_forms",
            "list_recipients",
            "toggle_alias",
            "toggle_drop",
            "toggle_form",
        ])

        for (const tool of tools) {
            expect(tool.title, tool.name).toEqual(expect.any(String))
            expect(tool.annotations?.title, tool.name).toBe(tool.title)
            expect(typeof tool.annotations?.readOnlyHint, tool.name).toBe("boolean")
            expect(typeof tool.annotations?.openWorldHint, tool.name).toBe("boolean")
            expect(tool.description?.length, tool.name).toBeGreaterThan(20)
            expect(tool.inputSchema.type, tool.name).toBe("object")
            expect(tool.outputSchema?.type, tool.name).toBe("object")

            if (tool.annotations?.readOnlyHint) {
                expect(tool.name, "read-only tools are list_*").toMatch(/^list_/)
            } else {
                // The spec defaults destructiveHint to true for any non-read-only
                // tool, so a write tool that omits it is shown as destructive.
                expect(typeof tool.annotations?.destructiveHint, tool.name).toBe("boolean")
                expect(typeof tool.annotations?.idempotentHint, tool.name).toBe("boolean")
                expect(tool.annotations?.destructiveHint, tool.name).toBe(tool.name.startsWith("delete_"))
            }

            // Every input property is documented for the model.
            const properties = (tool.inputSchema.properties ?? {}) as Record<string, { description?: string }>
            for (const [key, schema] of Object.entries(properties)) {
                expect(schema.description, `${tool.name}.${key}`).toEqual(expect.any(String))
            }
        }
        await client.close()
    })

    it("calls every tool successfully through the official client (outputSchema-validated)", async () => {
        const client = await connectClient()
        const calls: Array<[string, Record<string, unknown> | undefined]> = [
            ["list_aliases", undefined],
            ["list_aliases", { limit: 10, offset: 0 }],
            ["create_alias", {}],
            ["create_alias", { format: "custom", local_part: "jane.doe" }],
            ["toggle_alias", { id: "alias-1" }],
            ["delete_alias", { id: "JANE.DOE@ANON.LI" }],
            ["list_recipients", undefined],
            ["add_recipient", { email: "new@example.com" }],
            ["list_drops", undefined],
            ["toggle_drop", { id: "drop1234" }],
            ["delete_drop", { id: "drop1234" }],
            ["list_forms", {}],
            ["toggle_form", { id: "form1234" }],
            ["delete_form", { id: "form1234" }],
        ]

        for (const [name, args] of calls) {
            const result = await client.callTool({ name, arguments: args })
            expect(result.isError, `${name}: ${JSON.stringify(result.content)}`).toBeFalsy()
            expect(result.structuredContent, name).toBeDefined()
            const text = (result.content as Array<{ type: string, text: string }>)[0]!.text
            expect(JSON.parse(text), name).toEqual(result.structuredContent)
        }
        await client.close()
    })

    it("never leaks vault-encrypted or legacy alias fields", async () => {
        const client = await connectClient()
        const result = await client.callTool({ name: "list_aliases", arguments: {} })
        const serialized = JSON.stringify(result)
        expect(serialized).not.toContain("ciphertext")
        expect(serialized).not.toContain("legacy")
        await client.close()
    })

    it("paginates list_aliases and reports the full total", async () => {
        AliasService.countAliases.mockResolvedValueOnce(120)
        const client = await connectClient()
        const result = await client.callTool({ name: "list_aliases", arguments: { limit: 25, offset: 50 } })
        expect(AliasService.getAliases).toHaveBeenCalledWith(expect.anything(), { limit: 25, offset: 50 })
        expect(result.structuredContent).toMatchObject({ total: 120 })
        await client.close()
    })

    it("resolves alias email addresses case-insensitively", async () => {
        const client = await connectClient()
        const result = await client.callTool({ name: "toggle_alias", arguments: { id: "  Jane.Doe@Anon.LI " } })
        expect(result.isError).toBeFalsy()
        expect(resolveAlias).toHaveBeenCalledWith("jane.doe@anon.li", expect.anything())
        await client.close()
    })

    it("returns structured tool errors (not protocol errors) for business failures", async () => {
        const client = await connectClient()
        const missing = await client.callTool({ name: "toggle_alias", arguments: { id: "nope" } })
        expect(missing.isError).toBe(true)
        expect(missing._meta?.["anon.li/error"]).toMatchObject({ code: "NOT_FOUND" })

        getMcpSession.mockResolvedValue({ userId: "user-1", clientId: "client-1", scopes: "anon.li:aliases" })
        const scoped = await client.callTool({ name: "list_drops", arguments: {} })
        expect(scoped.isError).toBe(true)
        expect(scoped._meta?.["anon.li/error"]).toMatchObject({ code: "INSUFFICIENT_SCOPE" })
        await client.close()
    })

    it("rejects invalid arguments with a tool error the model can read", async () => {
        const client = await connectClient()
        const result = await client.callTool({ name: "list_drops", arguments: { limit: 1000 } })
        expect(result.isError).toBe(true)
        expect(DropService.listDrops).not.toHaveBeenCalled()
        await client.close()
    })

    it("accepts tools/call with arguments omitted or null", async () => {
        await (await connectClient()).close()
        for (const params of [{ name: "list_recipients" }, { name: "list_recipients", arguments: null }]) {
            const response = await rpc({ jsonrpc: "2.0", id: 7, method: "tools/call", params })
            expect(response.status).toBe(200)
            const body = await response.json() as { result?: { isError?: boolean } }
            expect(body.result?.isError).toBeFalsy()
        }
    })

    it("challenges unauthenticated requests with the app's normalized resource metadata", async () => {
        getMcpSession.mockResolvedValue(null)
        const response = await rpc(
            { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
            { Origin: "https://claude.ai" },
        )
        expect(response.status).toBe(401)
        const challenge = response.headers.get("www-authenticate")
        expect(challenge).toContain('resource_metadata="https://anon.li/.well-known/oauth-protected-resource"')
        expect(challenge).toContain('scope="anon.li:aliases anon.li:drops anon.li:forms offline_access"')
        expect(challenge).not.toContain("/api/auth/.well-known")
        expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai")
        expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate")
        const body = await response.json() as { error: Record<string, unknown> }
        expect(body.error).toEqual({ code: -32000, message: "Unauthorized: Authentication required" })
    })

    it("answers GET and DELETE with 405 so clients fall back to POST", async () => {
        for (const method of ["GET", "DELETE"]) {
            const response = await routeFetch(MCP_URL, { method, headers: { Origin: "https://claude.ai" } })
            expect(response.status).toBe(405)
            expect(response.headers.get("allow")).toBe("POST, OPTIONS")
            expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai")
        }
    })

    it("answers a cross-origin preflight", async () => {
        const response = await routeFetch(MCP_URL, {
            method: "OPTIONS",
            headers: { Origin: "https://claude.ai", "Access-Control-Request-Method": "POST" },
        })
        expect(response.status).toBe(204)
        expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai")
        expect(response.headers.get("access-control-allow-headers")).toContain("MCP-Protocol-Version")
        expect(response.headers.get("access-control-allow-headers")).toContain("Authorization")
    })

    it("rejects malformed JSON with a JSON-RPC parse error", async () => {
        const response = await rpc("{not json")
        expect(response.status).toBe(400)
        const body = await response.json() as { error: { code: number } }
        expect(body.error.code).toBe(-32700)
    })
})
