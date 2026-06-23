/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { personalScope } from "@/lib/ownership"

const getRecipients = vi.fn()
const addRecipient = vi.fn()

const invokeTool = vi.fn(async (_session, _opts, handler) => handler({ id: "user-1" }))

vi.mock("@/lib/services/recipient", () => ({
    RecipientService: { getRecipients, addRecipient },
}))

vi.mock("@/lib/mcp/invoke", () => ({
    invokeTool,
    toolResult: <T,>(data: T) => ({
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        structuredContent: data as Record<string, unknown>,
    }),
}))

interface RegisteredTool {
    meta: { annotations?: Record<string, unknown>, outputSchema?: unknown }
    handler: (args: Record<string, unknown>) => Promise<unknown>
}

interface FakeMcpServer {
    tools: Map<string, RegisteredTool>
    registerTool: (name: string, meta: RegisteredTool["meta"], handler: RegisteredTool["handler"]) => void
}

function makeServer(): FakeMcpServer {
    const tools = new Map<string, RegisteredTool>()
    return {
        tools,
        registerTool(name, meta, handler) {
            tools.set(name, { meta, handler })
        },
    }
}

const session = { userId: "user-1", clientId: "client-1" }

describe("MCP recipient tools", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        invokeTool.mockImplementation(async (_session, _opts, handler) => handler({ id: "user-1" }))
    })

    it("list_recipients gates on anon.li:aliases and reports verification + pgp flags", async () => {
        getRecipients.mockResolvedValueOnce([
            {
                id: "r1",
                email: "me@example.com",
                verified: true,
                isDefault: true,
                pgpFingerprint: "ABCDEF",
                createdAt: new Date("2026-04-01T00:00:00Z"),
            },
            {
                id: "r2",
                email: "other@example.com",
                verified: false,
                isDefault: false,
                pgpFingerprint: null,
                createdAt: new Date("2026-04-02T00:00:00Z"),
            },
        ])

        const server = makeServer()
        const { registerRecipientTools } = await import("@/lib/mcp/tools/recipients")
        registerRecipientTools(server as never, session)

        const tool = server.tools.get("list_recipients")!
        expect(tool.meta.annotations).toMatchObject({ readOnlyHint: true })

        const out = (await tool.handler({})) as {
            structuredContent: { total: number, recipients: Array<Record<string, unknown>> }
        }
        expect(invokeTool).toHaveBeenCalledWith(
            session,
            { scope: "anon.li:aliases", rateLimit: "recipientOps" },
            expect.any(Function),
        )
        expect(getRecipients).toHaveBeenCalledWith(personalScope("user-1"))
        expect(out.structuredContent.total).toBe(2)
        expect(out.structuredContent.recipients[0]).toMatchObject({ has_pgp: true, is_default: true })
        expect(out.structuredContent.recipients[1]).toMatchObject({ has_pgp: false, verified: false })
    })

    it("add_recipient is scoped to aliases and reports that verification was sent", async () => {
        addRecipient.mockResolvedValueOnce({ id: "r3", email: "new@example.com", verified: false })
        const server = makeServer()
        const { registerRecipientTools } = await import("@/lib/mcp/tools/recipients")
        registerRecipientTools(server as never, session)

        const out = (await server.tools.get("add_recipient")!.handler({ email: "new@example.com" })) as {
            structuredContent: { verification_sent: boolean, verified: boolean }
        }
        expect(invokeTool).toHaveBeenCalledWith(
            session,
            { scope: "anon.li:aliases", rateLimit: "recipientOps" },
            expect.any(Function),
        )
        expect(addRecipient).toHaveBeenCalledWith(personalScope("user-1"), "new@example.com")
        expect(out.structuredContent.verification_sent).toBe(true)
        expect(out.structuredContent.verified).toBe(false)
    })
})
