import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import { FormService } from "@/lib/services/form"
import { invokeTool, toolResult } from "@/lib/mcp/invoke"
import { personalScope } from "@/lib/ownership"
import type { McpSession } from "@/lib/mcp/types"

const formId = z.string().trim().min(1).max(64).describe("Form ID, as returned by list_forms")

export function registerFormTools(server: McpServer, session: McpSession) {
    server.registerTool(
        "list_forms",
        {
            title: "List forms",
            description:
                "List the user's end-to-end encrypted forms, newest first, with metadata (title, submission counts, state, close date). Returns one page plus `total` — page with `offset` while offset + returned < total. Submission contents are E2EE and cannot be read through this API — decrypt them in the web UI after unlocking the vault.",
            annotations: {
                title: "List forms",
                readOnlyHint: true,
                openWorldHint: false,
            },
            inputSchema: z.object({
                limit: z.number().int().min(1).max(100).default(50)
                    .describe("Maximum number of forms to return (1-100, default 50)"),
                offset: z.number().int().min(0).default(0)
                    .describe("Number of forms to skip, for pagination (default 0)"),
            }),
            outputSchema: z.object({
                total: z.number(),
                forms: z.array(z.object({
                    id: z.string(),
                    title: z.string(),
                    description: z.string().nullable(),
                    active: z.boolean(),
                    disabled_by_user: z.boolean(),
                    taken_down: z.boolean(),
                    allow_file_uploads: z.boolean(),
                    submissions_count: z.number(),
                    max_submissions: z.number().nullable(),
                    closes_at: z.string().nullable(),
                    hide_branding: z.boolean(),
                    notify_on_submission: z.boolean(),
                    created_at: z.string(),
                    updated_at: z.string(),
                })),
            }),
        },
        async ({ limit, offset }) => invokeTool(session, { scope: "anon.li:forms", quota: "form", rateLimit: "formList" }, async (user) => {
            const { forms, total } = await FormService.listForms(personalScope(user.id), { limit, offset })
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
            description: "Disable or re-enable a form. Disabled forms reject all new submissions until toggled back on. Each call inverts the current state, so check `disabled_by_user` from list_forms first and do not repeat the call to \"make sure\". Returns the new state.",
            annotations: {
                title: "Toggle form",
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false,
            },
            inputSchema: z.object({
                id: formId,
            }),
            outputSchema: z.object({
                id: z.string(),
                disabled: z.boolean(),
            }),
        },
        async ({ id }) => invokeTool(session, { scope: "anon.li:forms", quota: "form", rateLimit: "formOps" }, async (user) => {
            const disabled = await FormService.toggleForm(id, personalScope(user.id))
            return toolResult({ id, disabled })
        }),
    )

    server.registerTool(
        "delete_form",
        {
            title: "Delete form",
            description: "Permanently delete a form along with all its submissions and any attached file drops. This cannot be undone. This tool is flagged destructive (annotations.destructiveHint): MCP clients request user approval before executing it, and fail the call with 'No approval received' — without contacting this server — if approval is denied or unavailable (e.g. headless sessions). Nothing is deleted in that case; approve the client's permission prompt, or allowlist this tool in the client's permissions for unattended use.",
            annotations: {
                title: "Delete form",
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: false,
            },
            inputSchema: z.object({
                id: formId,
            }),
            outputSchema: z.object({
                deleted: z.boolean(),
                id: z.string(),
            }),
        },
        async ({ id }) => invokeTool(session, { scope: "anon.li:forms", quota: "form", rateLimit: "formOps" }, async (user) => {
            await FormService.deleteForm(id, personalScope(user.id))
            return toolResult({ deleted: true, id })
        }),
    )
}
