/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { personalScope } from "@/lib/ownership"
import { fakeGate } from "./helpers/mcp-fake-gate"

const listDrops = vi.fn()
const toggleDrop = vi.fn()
const setDropDisabled = vi.fn()
const deleteDrop = vi.fn()

const invokeTool = vi.fn(fakeGate({ id: "user-1" }))

vi.mock("@/lib/services/drop", () => ({
    DropService: { listDrops, toggleDrop, setDropDisabled, deleteDrop },
}))

vi.mock("@/lib/mcp/invoke", () => ({
    invokeTool,
    toolResult: <T,>(data: T) => ({
        content: [{ type: "text" as const, text: JSON.stringify(data, null, 2) }],
        structuredContent: data as Record<string, unknown>,
    }),
    toolError: (details: { code: string, message: string }) => ({
        content: [{ type: "text" as const, text: details.message }],
        isError: true,
        _meta: { "anon.li/error": details },
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
        invokeTool.mockImplementation(fakeGate({ id: "user-1" }))
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
            expect.objectContaining({ scope: "anon.li:drops", quota: "drop", rateLimit: "dropList" }),
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

    it("toggle_drop sets the requested state on standalone drops only", async () => {
        setDropDisabled.mockResolvedValue(false)
        const server = makeServer()
        const { registerDropTools } = await import("@/lib/mcp/tools/drops")
        registerDropTools(server as never, session)

        const tool = server.tools.get("toggle_drop")!
        expect(tool.meta.annotations).toMatchObject({ idempotentHint: true, destructiveHint: false })
        const out = (await tool.handler({ id: "d2", disabled: false })) as {
            structuredContent: { id: string, disabled: boolean }
        }
        expect(invokeTool).toHaveBeenCalledWith(
            session,
            expect.objectContaining({ scope: "anon.li:drops", quota: "drop", rateLimit: "dropOps" }),
            expect.any(Function),
        )
        expect(setDropDisabled).toHaveBeenCalledWith("d2", personalScope("user-1"), false, { standaloneOnly: true })
        expect(toggleDrop).not.toHaveBeenCalled()
        expect(out.structuredContent).toEqual({ id: "d2", disabled: false })
    })

    it("toggle_drop rejects a missing target state with VALIDATION_ERROR", async () => {
        const server = makeServer()
        const { registerDropTools } = await import("@/lib/mcp/tools/drops")
        registerDropTools(server as never, session)

        const out = (await server.tools.get("toggle_drop")!.handler({ id: "d2" })) as {
            isError: boolean, _meta: Record<string, { code: string }>
        }
        expect(out.isError).toBe(true)
        expect(out._meta["anon.li/error"]!.code).toBe("VALIDATION_ERROR")
        expect(setDropDisabled).not.toHaveBeenCalled()
    })

    it("delete_drop is flagged destructive and deletes by id", async () => {
        deleteDrop.mockResolvedValueOnce(undefined)
        const server = makeServer()
        const { registerDropTools } = await import("@/lib/mcp/tools/drops")
        registerDropTools(server as never, session)

        const tool = server.tools.get("delete_drop")!
        expect(tool.meta.annotations).toMatchObject({ destructiveHint: true })

        const out = (await tool.handler({ id: "d3" })) as { structuredContent: { deleted: boolean } }
        // Form attachment/staging and soft-deleted drops are NOT_FOUND here.
        expect(deleteDrop).toHaveBeenCalledWith("d3", personalScope("user-1"), { standaloneOnly: true })
        expect(out.structuredContent.deleted).toBe(true)
    })
})
