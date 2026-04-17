import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { DropService } from "@/lib/services/drop"
import { invokeTool, toolResult } from "@/lib/mcp/invoke"
import type { McpSession } from "@/lib/mcp/types"

export function registerDropTools(server: McpServer, session: McpSession) {
    server.registerTool(
        "list_drops",
        {
            title: "List drops",
            description:
                "List the user's encrypted file drops with metadata (size, expiry, download counts). File contents and filenames are end-to-end encrypted and cannot be read through this API. Use the web UI or CLI with the user's vault key to access content.",
            inputSchema: {
                limit: z.number().int().min(1).max(100).default(50),
                offset: z.number().int().min(0).default(0),
            },
        },
        async ({ limit, offset }) => invokeTool(session, { quota: "drop", rateLimit: "dropList" }, async (user) => {
            const { drops, total } = await DropService.listDrops(user.id, { limit, offset })
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
            inputSchema: {
                id: z.string().min(1),
            },
        },
        async ({ id }) => invokeTool(session, { quota: "drop", rateLimit: "dropOps" }, async (user) => {
            const disabled = await DropService.toggleDrop(id, user.id)
            return toolResult({ id, disabled })
        }),
    )

    server.registerTool(
        "delete_drop",
        {
            title: "Delete drop",
            description: "Permanently delete a drop and all its files. Reclaims the storage quota. This cannot be undone.",
            inputSchema: {
                id: z.string().min(1),
            },
        },
        async ({ id }) => invokeTool(session, { quota: "drop", rateLimit: "dropOps" }, async (user) => {
            await DropService.deleteDrop(id, user.id)
            return toolResult({ deleted: true, id })
        }),
    )
}
