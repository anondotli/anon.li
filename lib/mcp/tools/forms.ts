import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { FormService } from "@/lib/services/form"
import { invokeTool, toolResult } from "@/lib/mcp/invoke"
import type { McpSession } from "@/lib/mcp/types"

export function registerFormTools(server: McpServer, session: McpSession) {
    server.registerTool(
        "list_forms",
        {
            title: "List forms",
            description:
                "List the user's end-to-end encrypted forms with metadata (submission counts, state, close date). Submission contents are E2EE and cannot be read through this API — decrypt them in the web UI after unlocking the vault.",
            inputSchema: {
                limit: z.number().int().min(1).max(100).default(50),
                offset: z.number().int().min(0).default(0),
            },
        },
        async ({ limit, offset }) => invokeTool(session, { quota: "form", rateLimit: "formList" }, async (user) => {
            const { forms, total } = await FormService.listForms(user.id, { limit, offset })
            return toolResult({
                total,
                forms: forms.map((f) => ({
                    id: f.id,
                    title: f.title,
                    description: f.description,
                    active: f.active,
                    disabled_by_user: f.disabledByUser,
                    taken_down: f.takenDown,
                    allow_file_uploads: f.allowFileUploads,
                    submissions_count: f.submissionsCount,
                    max_submissions: f.maxSubmissions,
                    closes_at: f.closesAt?.toISOString() ?? null,
                    hide_branding: f.hideBranding,
                    notify_on_submission: f.notifyOnSubmission,
                    created_at: f.createdAt.toISOString(),
                    updated_at: f.updatedAt.toISOString(),
                })),
            })
        }),
    )

    server.registerTool(
        "toggle_form",
        {
            title: "Toggle form",
            description: "Disable or re-enable a form. Disabled forms reject all new submissions until toggled back on.",
            inputSchema: {
                id: z.string().min(1),
            },
        },
        async ({ id }) => invokeTool(session, { quota: "form", rateLimit: "formOps" }, async (user) => {
            const disabled = await FormService.toggleForm(id, user.id)
            return toolResult({ id, disabled })
        }),
    )

    server.registerTool(
        "delete_form",
        {
            title: "Delete form",
            description: "Permanently delete a form along with all its submissions and any attached file drops. This cannot be undone.",
            inputSchema: {
                id: z.string().min(1),
            },
        },
        async ({ id }) => invokeTool(session, { quota: "form", rateLimit: "formOps" }, async (user) => {
            await FormService.deleteForm(id, user.id)
            return toolResult({ deleted: true, id })
        }),
    )
}
