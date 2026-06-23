/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { personalScope } from "@/lib/ownership"

const listDrops = vi.fn()
const toggleDrop = vi.fn()
const deleteDrop = vi.fn()

const invokeTool = vi.fn(async (_session, _opts, handler) => handler({ id: "user-1" }))

vi.mock("@/lib/services/drop", () => ({
    DropService: { listDrops, toggleDrop, deleteDrop },
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

describe("MCP drop tools", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        invokeTool.mockImplementation(async (_session, _opts, handler) => handler({ id: "user-1" }))
    })

    it("list_drops gates on anon.li:drops and exposes metadata only", async () => {
        listDrops.mockResolvedValueOnce({
            total: 1,
            drops: [{
                id: "d1",
                fileCount: 2,
                totalSize: "2048",
                downloads: 3,
                maxDownloads: null,
                disabled: false,
                takenDown: false,
                uploadComplete: true,
                expiresAt: new Date("2026-05-01T00:00:00Z"),
                createdAt: new Date("2026-04-01T00:00:00Z"),
            }],
        })

        const server = makeServer()
        const { registerDropTools } = await import("@/lib/mcp/tools/drops")
        registerDropTools(server as never, session)

        const tool = server.tools.get("list_drops")!
        expect(tool.meta.annotations).toMatchObject({ readOnlyHint: true })
        expect(tool.meta.outputSchema).toBeDefined()

        const out = (await tool.handler({ limit: 50, offset: 0 })) as {
            structuredContent: { total: number, drops: Array<Record<string, unknown>> }
        }
        expect(invokeTool).toHaveBeenCalledWith(
            session,
            { scope: "anon.li:drops", quota: "drop", rateLimit: "dropList" },
            expect.any(Function),
        )
        expect(listDrops).toHaveBeenCalledWith(personalScope("user-1"), { limit: 50, offset: 0 })
        const drop = out.structuredContent.drops[0]!
        expect(drop.id).toBe("d1")
        expect(drop.total_size_bytes).toBe("2048")
        expect(drop.max_downloads).toBeNull()
        expect(drop.expires_at).toBe("2026-05-01T00:00:00.000Z")
        // No content/filename fields are ever exposed.
        expect(drop).not.toHaveProperty("files")
        expect(drop).not.toHaveProperty("filenames")
    })

    it("toggle_drop flips state and is scoped to drops", async () => {
        toggleDrop.mockResolvedValueOnce(true)
        const server = makeServer()
        const { registerDropTools } = await import("@/lib/mcp/tools/drops")
        registerDropTools(server as never, session)

        const out = (await server.tools.get("toggle_drop")!.handler({ id: "d2" })) as {
            structuredContent: { id: string, disabled: boolean }
        }
        expect(invokeTool).toHaveBeenCalledWith(
            session,
            { scope: "anon.li:drops", quota: "drop", rateLimit: "dropOps" },
            expect.any(Function),
        )
        expect(toggleDrop).toHaveBeenCalledWith("d2", personalScope("user-1"))
        expect(out.structuredContent).toEqual({ id: "d2", disabled: true })
    })

    it("delete_drop is flagged destructive and deletes by id", async () => {
        deleteDrop.mockResolvedValueOnce(undefined)
        const server = makeServer()
        const { registerDropTools } = await import("@/lib/mcp/tools/drops")
        registerDropTools(server as never, session)

        const tool = server.tools.get("delete_drop")!
        expect(tool.meta.annotations).toMatchObject({ destructiveHint: true })

        const out = (await tool.handler({ id: "d3" })) as { structuredContent: { deleted: boolean } }
        expect(deleteDrop).toHaveBeenCalledWith("d3", personalScope("user-1"))
        expect(out.structuredContent.deleted).toBe(true)
    })
})
