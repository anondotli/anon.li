import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import { DropService } from "@/lib/services/drop"
import { toolResult } from "@/lib/mcp/invoke"
import { registerMcpTool } from "@/lib/mcp/define-tool"
import { personalScope } from "@/lib/ownership"
import type { McpSession } from "@/lib/mcp/types"

const dropId = z.string().trim().min(1).max(64).describe("Drop ID, as returned by list_drops")

export function registerDropTools(server: McpServer, session: McpSession) {
    registerMcpTool(server, session,
        "list_drops",
        {
            title: "List drops",
            description:
                "List the user's encrypted file drops, newest first, with metadata (file count, total size in bytes as a decimal string, expiry, download counts, state). Returns one page plus `total` — page with `offset` while offset + returned < total. File contents and filenames are end-to-end encrypted and cannot be read through this API. Use the web UI or CLI with the user's vault key to access content.",
            annotations: {
                title: "List drops",
                readOnlyHint: true,
                openWorldHint: false,
            },
            inputSchema: z.object({
                limit: z.number().int().min(1).max(100).default(50)
                    .describe("Maximum number of drops to return (1-100, default 50)"),
                offset: z.number().int().min(0).default(0)
                    .describe("Number of drops to skip, for pagination (default 0)"),
            }),
            outputSchema: z.object({
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
            }),
        },
        { scope: "anon.li:drops", quota: "drop", rateLimit: "dropList" },
        async ({ limit, offset }, user) => {
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
        },
    )

    registerMcpTool(server, session,
        "toggle_drop",
        {
            title: "Set drop disabled state",
            description: "Disable or re-enable a drop: `disabled: true` rejects all downloads, `disabled: false` restores access. Sets the given state (it does not flip), so repeating a call is safe. Returns the resulting state. Only standalone drops from list_drops are accepted; form attachments are managed with their form.",
            annotations: {
                title: "Set drop disabled state",
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: true,
                openWorldHint: false,
            },
            inputSchema: z.object({
                id: dropId,
                disabled: z.boolean()
                    .describe("Target state: true to block all downloads, false to allow them again"),
            }),
            outputSchema: z.object({
                id: z.string(),
                disabled: z.boolean(),
            }),
        },
        { scope: "anon.li:drops", quota: "drop", rateLimit: "dropOps" },
        async ({ id, disabled }, user) => {
            const state = await DropService.setDropDisabled(id, personalScope(user.id), disabled, { standaloneOnly: true })
            return toolResult({ id, disabled: state })
        },
    )

    registerMcpTool(server, session,
        "delete_drop",
        {
            title: "Delete drop",
            description: "Permanently delete a drop and all its files. Reclaims the storage quota. This cannot be undone. Only standalone drops from list_drops are accepted; form attachments are deleted with their form submission. This tool is flagged destructive (annotations.destructiveHint): MCP clients request user approval before executing it, and fail the call with 'No approval received' — without contacting this server — if approval is denied or unavailable (e.g. headless sessions). Nothing is deleted in that case; approve the client's permission prompt, or allowlist this tool in the client's permissions for unattended use.",
            annotations: {
                title: "Delete drop",
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: false,
            },
            inputSchema: z.object({
                id: dropId,
            }),
            outputSchema: z.object({
                deleted: z.boolean(),
                id: z.string(),
            }),
        },
        { scope: "anon.li:drops", quota: "drop", rateLimit: "dropOps" },
        async ({ id }, user) => {
            await DropService.deleteDrop(id, personalScope(user.id), { standaloneOnly: true })
            return toolResult({ deleted: true, id })
        },
    )
}
