/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { personalScope } from "@/lib/ownership"

const listForms = vi.fn()
const toggleForm = vi.fn()
const deleteForm = vi.fn()

const invokeTool = vi.fn(async (_session, _opts, handler) => handler({ id: "user-1" }))

vi.mock("@/lib/services/form", () => ({
    FormService: { listForms, toggleForm, deleteForm },
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

describe("MCP form tools", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        invokeTool.mockImplementation(async (_session, _opts, handler) => handler({ id: "user-1" }))
    })

    it("list_forms gates on anon.li:forms and exposes metadata only", async () => {
        listForms.mockResolvedValueOnce({
            total: 1,
            forms: [{
                id: "f1",
                title: "Contact",
                description: null,
                active: true,
                disabledByUser: false,
                takenDown: false,
                allowFileUploads: true,
                submissionsCount: 4,
                maxSubmissions: null,
                closesAt: new Date("2026-06-01T00:00:00Z"),
                hideBranding: false,
                notifyOnSubmission: true,
                createdAt: new Date("2026-04-01T00:00:00Z"),
                updatedAt: new Date("2026-04-02T00:00:00Z"),
            }],
        })

        const server = makeServer()
        const { registerFormTools } = await import("@/lib/mcp/tools/forms")
        registerFormTools(server as never, session)

        const tool = server.tools.get("list_forms")!
        expect(tool.meta.annotations).toMatchObject({ readOnlyHint: true })
        expect(tool.meta.outputSchema).toBeDefined()

        const out = (await tool.handler({ limit: 50, offset: 0 })) as {
            structuredContent: { forms: Array<Record<string, unknown>> }
        }
        expect(invokeTool).toHaveBeenCalledWith(
            session,
            { scope: "anon.li:forms", quota: "form", rateLimit: "formList" },
            expect.any(Function),
        )
        expect(listForms).toHaveBeenCalledWith(personalScope("user-1"), { limit: 50, offset: 0 })
        const form = out.structuredContent.forms[0]!
        expect(form.id).toBe("f1")
        expect(form.max_submissions).toBeNull()
        expect(form.closes_at).toBe("2026-06-01T00:00:00.000Z")
        // Submission contents are E2EE and never surface here.
        expect(form).not.toHaveProperty("submissions")
        expect(form).not.toHaveProperty("schemaJson")
    })

    it("toggle_form flips state and is scoped to forms", async () => {
        toggleForm.mockResolvedValueOnce(true)
        const server = makeServer()
        const { registerFormTools } = await import("@/lib/mcp/tools/forms")
        registerFormTools(server as never, session)

        const out = (await server.tools.get("toggle_form")!.handler({ id: "f2" })) as {
            structuredContent: { id: string, disabled: boolean }
        }
        expect(invokeTool).toHaveBeenCalledWith(
            session,
            { scope: "anon.li:forms", quota: "form", rateLimit: "formOps" },
            expect.any(Function),
        )
        expect(toggleForm).toHaveBeenCalledWith("f2", personalScope("user-1"))
        expect(out.structuredContent).toEqual({ id: "f2", disabled: true })
    })

    it("delete_form is flagged destructive and deletes by id", async () => {
        deleteForm.mockResolvedValueOnce(undefined)
        const server = makeServer()
        const { registerFormTools } = await import("@/lib/mcp/tools/forms")
        registerFormTools(server as never, session)

        const tool = server.tools.get("delete_form")!
        expect(tool.meta.annotations).toMatchObject({ destructiveHint: true })

        const out = (await tool.handler({ id: "f3" })) as { structuredContent: { deleted: boolean } }
        expect(deleteForm).toHaveBeenCalledWith("f3", personalScope("user-1"))
        expect(out.structuredContent.deleted).toBe(true)
    })
})
