import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { DropService } from "@/lib/services/drop"
import { invokeTool, toolResult } from "@/lib/mcp/invoke"
import { personalScope } from "@/lib/ownership"
import type { McpSession } from "@/lib/mcp/types"

export function registerDropTools(server: McpServer, session: McpSession) {
    server.registerTool(
        "list_drops",
        {
            title: "List drops",
            description:
                "List the user's encrypted file drops with metadata (size, expiry, download counts). File contents and filenames are end-to-end encrypted and cannot be read through this API. Use the web UI or CLI with the user's vault key to access content.",
            annotations: { readOnlyHint: true, openWorldHint: false },
            inputSchema: {
                limit: z.number().int().min(1).max(100).default(50),
                offset: z.number().int().min(0).default(0),
            },
            outputSchema: {
                total: z.number(),
                drops: z.array(z.object({
                    id: z.string(),
                    file_count: z.number(),
                    total_size_bytes: z.string(),
                    downloads: z.number(),
                    max_downloads: z.number().nullable(),
                    disabled: z.boolean(),
                    taken_down: z.boolean(),
                    upload_complete: z.boolean(),
                    expires_at: z.string().nullable(),
                    created_at: z.string(),
                })),
            },
        },
        async ({ limit, offset }) => invokeTool(session, { scope: "anon.li:drops", quota: "drop", rateLimit: "dropList" }, async (user) => {
            const { drops, total } = await DropService.listDrops(personalScope(user.id), { limit, offset })
            return toolResult({
                total,
                drops: drops.map((d) => ({
                    id: d.id,
                    file_count: d.fileCount,
                    total_size_bytes: d.totalSize,
                    downloads: d.downloads,
                    max_downloads: d.maxDownloads,
                    disabled: d.disabled,
                    taken_down: d.takenDown,
                    upload_complete: d.uploadComplete,
                    expires_at: d.expiresAt?.toISOString() ?? null,
                    created_at: d.createdAt.toISOString(),
                })),
            })
        }),
    )

    server.registerTool(
        "toggle_drop",
        {
            title: "Toggle drop",
            description: "Disable or re-enable a drop. Disabled drops reject all downloads until toggled back on.",
            annotations: { openWorldHint: false },
            inputSchema: {
                id: z.string().min(1),
            },
            outputSchema: {
                id: z.string(),
                disabled: z.boolean(),
            },
        },
        async ({ id }) => invokeTool(session, { scope: "anon.li:drops", quota: "drop", rateLimit: "dropOps" }, async (user) => {
            const disabled = await DropService.toggleDrop(id, personalScope(user.id))
            return toolResult({ id, disabled })
        }),
    )

    server.registerTool(
        "delete_drop",
        {
            title: "Delete drop",
            description: "Permanently delete a drop and all its files. Reclaims the storage quota. This cannot be undone.",
            annotations: { destructiveHint: true, openWorldHint: false },
            inputSchema: {
                id: z.string().min(1),
            },
            outputSchema: {
                deleted: z.boolean(),
                id: z.string(),
            },
        },
        async ({ id }) => invokeTool(session, { scope: "anon.li:drops", quota: "drop", rateLimit: "dropOps" }, async (user) => {
            await DropService.deleteDrop(id, personalScope(user.id))
            return toolResult({ deleted: true, id })
        }),
    )
}
