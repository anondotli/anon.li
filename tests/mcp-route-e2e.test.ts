/**
 * @vitest-environment node
 *
 * End-to-end coverage of `/api/mcp`: the real route handler (legacy 2025-era
 * leg and the MCP 2026-07-28 leg), the real `invokeTool` gate and the real
 * tool registrations, driven by the official SDK clients over Streamable HTTP
 * — the v1 SDK client (what deployed MCP clients speak today) and the v2
 * client pinned to 2026-07-28. better-auth's `requireMcpAuth` JWT verification
 * is replaced by a fake that yields claims; the persistence layer (services,
 * Prisma, Redis) is mocked.
 *
 * The official client validates every `structuredContent` against the tool's
 * declared `outputSchema`, so any drift between a handler and its schema fails
 * here the same way it fails in Claude.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Client as LegacyClient } from "@modelcontextprotocol/sdk/client/index.js"
import { StreamableHTTPClientTransport as LegacyTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js"
import { Client as ModernClient, StreamableHTTPClientTransport as ModernTransport } from "@modelcontextprotocol/client"
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/server"

process.env.NEXT_PUBLIC_APP_URL = "https://anon.li"

/** Claims the fake `requireMcpAuth` yields for a bearer token; null = invalid token. */
const verifyToken = vi.fn<(token: string) => Record<string, unknown> | null>()
const authOptions = vi.hoisted(() => ({ value: undefined as unknown }))

vi.mock("@/lib/auth", () => ({ auth: {} }))

vi.mock("@better-auth/mcp", () => ({
    requireMcpAuth: (_auth: unknown, handler: (req: Request, claims: Record<string, unknown>) => Promise<Response>, opts: unknown) => {
        authOptions.value = opts
        return async (req: Request) => {
            const token = (req.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "")
            const claims = token ? verifyToken(token) : null
            if (!claims) {
                return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: "no token payload" }, id: null }), {
                    status: 401,
                    headers: { "WWW-Authenticate": 'Bearer resource_metadata="https://anon.li/.well-known/oauth-protected-resource/api/mcp"' },
                })
            }
            return handler(req, claims)
        }
    },
}))

const findOauthClient = vi.fn()

/** The PostHog client the route sees; null = analytics not configured. */
const posthogState = vi.hoisted(() => ({ client: null as unknown }))

vi.mock("@/lib/posthog.server", () => ({
    getPostHogClient: () => posthogState.client,
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
        oauthClient: { findUnique: findOauthClient },
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
    updateAlias: vi.fn(async () => ({ ...aliasRow, active: false })),
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
    setDropDisabled: vi.fn(async () => true),
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
    setFormDisabled: vi.fn(async () => true),
    deleteForm: vi.fn(async () => {}),
}
vi.mock("@/lib/services/form", () => ({ FormService }))

const ALL_SCOPES = "anon.li:aliases anon.li:drops anon.li:forms offline_access"
const MCP_URL = "https://anon.li/api/mcp"
const TOKEN_IAT = 1_791_000_000

async function route() {
    return import("@/app/api/mcp/route")
}

/** Status, challenge and content type of every response the route produced (newest last). */
const seenResponses: Array<{ status: number, wwwAuthenticate: string | null, contentType: string | null }> = []

/** fetch() that dispatches straight into the Next.js route handlers. */
async function routeFetch(input: string | URL | Request, init?: RequestInit): Promise<Response> {
    const request = new Request(input, init)
    const handlers = await route()
    let response: Response
    switch (request.method) {
        case "POST": response = await handlers.POST(request); break
        case "GET": response = handlers.GET(request); break
        case "DELETE": response = handlers.DELETE(request); break
        case "OPTIONS": response = handlers.OPTIONS(request); break
        default: response = new Response(null, { status: 405 })
    }
    seenResponses.push({
        status: response.status,
        wwwAuthenticate: response.headers.get("www-authenticate"),
        contentType: response.headers.get("content-type"),
    })
    return response
}

interface E2eClient {
    getServerVersion(): { name: string; version: string } | undefined
    getServerCapabilities(): { tools?: unknown } | undefined
    getInstructions(): string | undefined
    listTools(): Promise<{ tools: Array<{
        name: string
        title?: string
        description?: string
        annotations?: Record<string, unknown>
        inputSchema: { type: string; properties?: unknown }
        outputSchema?: { type: string }
    }> }>
    callTool(params: { name: string; arguments?: Record<string, unknown> }): Promise<{
        isError?: boolean
        content: unknown
        structuredContent?: unknown
        _meta?: Record<string, unknown>
    }>
    close(): Promise<void>
}

const CLIENT_ERAS: Array<[string, () => Promise<E2eClient>]> = [
    ["2025-era client (SDK v1, legacy leg)", async () => {
        const client = new LegacyClient({ name: "e2e-client", version: "0.0.0" })
        await client.connect(new LegacyTransport(new URL(MCP_URL), {
            fetch: routeFetch,
            requestInit: { headers: { Authorization: "Bearer test-token" } },
        }))
        return client as unknown as E2eClient
    }],
    ["2026-07-28 client (SDK v2, modern leg)", async () => {
        const client = new ModernClient(
            { name: "e2e-client", version: "0.0.0" },
            { versionNegotiation: { mode: { pin: "2026-07-28" } } },
        )
        await client.connect(new ModernTransport(new URL(MCP_URL), {
            fetch: routeFetch,
            requestInit: { headers: { Authorization: "Bearer test-token" } },
        }))
        return client as unknown as E2eClient
    }],
]

let connectClient: () => Promise<E2eClient> = CLIENT_ERAS[0]![1]

function grantClaims(scope = ALL_SCOPES) {
    verifyToken.mockImplementation((token) => token === "test-token"
        ? { sub: "user-1", azp: "client-1", client_id: "client-1", scope, aud: MCP_URL, iat: TOKEN_IAT }
        : null)
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

function resetMocks() {
        vi.clearAllMocks()
        seenResponses.length = 0
        posthogState.client = null
        grantClaims()
        findOauthClient.mockResolvedValue({ disabled: false, consents: [{ id: "consent-1" }] })
        getAuthUserState.mockResolvedValue({
            banned: false,
            banReason: null,
            banAliasCreation: false,
            banFileUpload: false,
            subscriptions: [],
        })
}

describe.each(CLIENT_ERAS)("/api/mcp end to end — %s", (_label, connect) => {
    beforeEach(() => {
        resetMocks()
        connectClient = connect
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
                // Deletes, plus toggle_alias (disabling an alias drops its mail).
                expect(tool.annotations?.destructiveHint, tool.name)
                    .toBe(tool.name.startsWith("delete_") || tool.name === "toggle_alias")
                // Toggles take a target state, so repeating one is safe.
                if (tool.name.startsWith("toggle_")) {
                    expect(tool.annotations?.idempotentHint, tool.name).toBe(true)
                }
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
            ["toggle_alias", { id: "alias-1", active: false }],
            ["delete_alias", { id: "JANE.DOE@ANON.LI" }],
            ["list_recipients", undefined],
            ["add_recipient", { email: "new@example.com" }],
            ["list_drops", undefined],
            ["toggle_drop", { id: "drop1234", disabled: true }],
            ["delete_drop", { id: "drop1234" }],
            ["list_forms", {}],
            ["toggle_form", { id: "form1234", disabled: true }],
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
        const result = await client.callTool({ name: "toggle_alias", arguments: { id: "  Jane.Doe@Anon.LI ", active: true } })
        expect(result.isError).toBeFalsy()
        expect(resolveAlias).toHaveBeenCalledWith("jane.doe@anon.li", expect.anything())
        await client.close()
    })

    it("returns structured tool errors (not protocol errors) for business failures", async () => {
        const client = await connectClient()
        const missing = await client.callTool({ name: "toggle_alias", arguments: { id: "nope", active: true } })
        expect(missing.isError).toBe(true)
        expect(missing._meta?.["anon.li/error"]).toMatchObject({ code: "NOT_FOUND" })
        await client.close()
    })

    it("answers a tool call outside the token's scopes with an HTTP 403 step-up challenge", async () => {
        const client = await connectClient()
        grantClaims("anon.li:aliases offline_access")
        await expect(client.callTool({ name: "list_drops", arguments: {} })).rejects.toThrow()
        expect(DropService.listDrops).not.toHaveBeenCalled()

        const challenge = seenResponses.at(-1)!
        expect(challenge.status).toBe(403)
        expect(challenge.wwwAuthenticate).toContain('error="insufficient_scope"')
        // Granted scopes plus the missing one, so re-authorizing keeps existing access.
        expect(challenge.wwwAuthenticate).toContain('scope="anon.li:aliases offline_access anon.li:drops"')
        expect(challenge.wwwAuthenticate).toContain(
            'resource_metadata="https://anon.li/.well-known/oauth-protected-resource/api/mcp"',
        )

        // Tools within the granted scopes keep working on the same token.
        const allowed = await client.callTool({ name: "list_aliases", arguments: {} })
        expect(allowed.isError).toBeFalsy()
        await client.close()
    })

    it("rejects invalid arguments with a tool error the model can read", async () => {
        const client = await connectClient()
        const result = await client.callTool({ name: "list_drops", arguments: { limit: 1000 } })
        expect(result.isError).toBe(true)
        expect(result._meta?.["anon.li/error"]).toMatchObject({ code: "VALIDATION_ERROR" })
        expect(DropService.listDrops).not.toHaveBeenCalled()
        await client.close()
    })

})

describe("/api/mcp with PostHog analytics configured", () => {
    beforeEach(() => {
        resetMocks()
    })

    it.each(CLIENT_ERAS)("advertises the same tools/list as without analytics — %s", async (_label, connect) => {
        const { PostHog } = await import("posthog-node")
        const withoutClient = await connect()
        const baseline = await withoutClient.listTools()
        await withoutClient.close()

        const sent: unknown[] = []
        const posthog = new PostHog("phc_test", {
            host: "https://posthog.invalid",
            flushAt: 1000,
            flushInterval: 0,
            fetch: async (_url, options) => {
                sent.push(options.body)
                return { status: 200, text: async () => "{}", json: async () => ({}) }
            },
        })
        const capture = vi.spyOn(posthog, "capture")
        posthogState.client = posthog

        const withClient = await connect()
        const instrumented = await withClient.listTools()
        await withClient.callTool({ name: "add_recipient", arguments: { email: "new@example.com" } })
        await withClient.close()

        expect(instrumented).toEqual(baseline)
        for (const tool of instrumented.tools) {
            const properties = Object.keys(tool.inputSchema.properties ?? {})
            expect(properties, tool.name).not.toContain("conversation_id")
            expect(properties, tool.name).not.toContain("llm_model")
        }

        // Instrumentation was live, yet no event carried tool arguments/results.
        expect(capture).toHaveBeenCalled()
        for (const [event] of capture.mock.calls) {
            const properties = (event as { properties?: Record<string, unknown> }).properties ?? {}
            expect(properties).not.toHaveProperty("$mcp_parameters")
            expect(properties).not.toHaveProperty("$mcp_response")
            expect(JSON.stringify(properties)).not.toContain("new@example.com")
        }
        await posthog.shutdown()
    })
})

describe("/api/mcp HTTP behaviour", () => {
    beforeEach(() => {
        resetMocks()
        connectClient = CLIENT_ERAS[0]![1]
    })

    it("verifies tokens for the canonical MCP resource and origin issuer", async () => {
        await (await connectClient()).close()
        expect(authOptions.value).toEqual(expect.objectContaining({
            resource: "https://anon.li/api/mcp",
            issuer: "https://anon.li",
        }))
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

    it("answers the 2026-07-28 leg with single JSON bodies and ends listen streams after the ack", async () => {
        const client = await CLIENT_ERAS[1]![1]() as unknown as ModernClient
        seenResponses.length = 0
        await client.listTools()
        await client.callTool({ name: "list_recipients" })
        expect(seenResponses.length).toBeGreaterThan(0)
        for (const response of seenResponses) expect(response.contentType).toMatch(/^application\/json/)

        // Nothing subscribable is advertised, so the stream acks an empty filter and completes.
        const subscription = await client.listen({ toolsListChanged: true })
        expect(subscription.honoredFilter).toEqual({})
        await expect(subscription.closed).resolves.toBe("graceful")
        await client.close()
    })

    it("challenges unauthenticated requests with the app's resource metadata", async () => {
        const response = await rpc(
            { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
            { Origin: "https://claude.ai", Authorization: "" },
        )
        expect(response.status).toBe(401)
        const challenge = response.headers.get("www-authenticate")
        expect(challenge).toContain('resource_metadata="https://anon.li/.well-known/oauth-protected-resource/api/mcp"')
        expect(challenge).not.toContain("invalid_token")
        expect(challenge).toContain('scope="anon.li:aliases anon.li:drops anon.li:forms offline_access"')
        expect(challenge).not.toContain("/api/auth/.well-known")
        expect(response.headers.get("access-control-allow-origin")).toBe("https://claude.ai")
        expect(response.headers.get("access-control-expose-headers")).toContain("WWW-Authenticate")
        const body = await response.json() as { error: Record<string, unknown> }
        expect(body.error).toEqual({ code: -32000, message: "Unauthorized: Authentication required" })
    })

    it("marks a rejected bearer token as invalid_token so clients refresh", async () => {
        const response = await rpc(
            { jsonrpc: "2.0", id: 1, method: "initialize", params: {} },
            { Authorization: "Bearer stale-opaque-1.6-token" },
        )
        expect(response.status).toBe(401)
        expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"')
    })

    it("rejects tokens of a disabled or deleted OAuth client", async () => {
        for (const client of [{ disabled: true, consents: [{ id: "consent-1" }] }, null]) {
            findOauthClient.mockResolvedValueOnce(client)
            const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
            expect(response.status).toBe(401)
            expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"')
        }
        expect(findOauthClient).toHaveBeenCalledWith(expect.objectContaining({ where: { clientId: "client-1" } }))
    })

    it("rejects a still-valid token once the user revoked the app in Connected apps", async () => {
        const ok = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
        expect(ok.status).toBe(200)

        // Revocation deleted the user's consent; the JWT itself still verifies.
        findOauthClient.mockResolvedValueOnce({ disabled: false, consents: [] })
        const response = await rpc({ jsonrpc: "2.0", id: 2, method: "tools/list", params: {} })
        expect(response.status).toBe(401)
        expect(response.headers.get("www-authenticate")).toContain('error="invalid_token"')

        // The lookup is scoped to this user's consent, issued no later than the
        // token (plus skew), so reconnecting does not revive pre-revoke tokens.
        expect(findOauthClient).toHaveBeenLastCalledWith({
            where: { clientId: "client-1" },
            select: {
                disabled: true,
                consents: {
                    where: { userId: "user-1", createdAt: { lte: new Date(TOKEN_IAT * 1000 + 60_000) } },
                    select: { id: true },
                    take: 1,
                },
            },
        })
    })

    it("rejects tokens without a user subject", async () => {
        verifyToken.mockReturnValue({ azp: "client-1", scope: ALL_SCOPES })
        const response = await rpc({ jsonrpc: "2.0", id: 1, method: "tools/list", params: {} })
        expect(response.status).toBe(401)
    })

    it("rejects non-JSON bodies with 415", async () => {
        const response = await rpc("x", { "Content-Type": "text/plain" })
        expect(response.status).toBe(415)
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
