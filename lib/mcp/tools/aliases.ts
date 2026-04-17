import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { AliasService } from "@/lib/services/alias"
import { resolveAlias, toAddyFormat } from "@/app/api/v1/alias/_utils"
import { invokeTool, toolResult } from "@/lib/mcp/invoke"
import type { McpSession } from "@/lib/mcp/types"

export function registerAliasTools(server: McpServer, session: McpSession) {
    server.registerTool(
        "list_aliases",
        {
            title: "List aliases",
            description:
                "List all email aliases owned by the authenticated user. Returns an array of aliases with id, email, active state, received/blocked counters, and timestamps. Labels and notes are omitted because they are vault-encrypted client-side and cannot be read by a third-party client.",
            inputSchema: {},
        },
        async () => invokeTool(session, { quota: "alias", rateLimit: "api" }, async (user) => {
            const aliases = await AliasService.getAliases(user.id)
            return toolResult({
                total: aliases.length,
                aliases: aliases.map((a) => ({
                    ...toAddyFormat({
                        id: a.id,
                        email: a.email,
                        active: a.active,
                        createdAt: a.createdAt,
                        updatedAt: a.updatedAt,
                    }),
                    emails_received: a.emailsReceived,
                    emails_blocked: a.emailsBlocked,
                    last_email_at: a.lastEmailAt?.toISOString() ?? null,
                    encrypted_label: undefined,
                    encrypted_note: undefined,
                })),
            })
        }),
    )

    server.registerTool(
        "create_alias",
        {
            title: "Create alias",
            description:
                "Create a new email alias. Use format=\"random\" to auto-generate the local part, or format=\"custom\" with `local_part`. Labels and notes cannot be set here (they are vault-encrypted client-side); the user can edit them from the anon.li web UI.",
            inputSchema: {
                domain: z.string().max(253).default("anon.li").describe("Domain to use (default: anon.li)"),
                format: z.enum(["random", "custom"]).default("random"),
                local_part: z.string().max(64).optional().describe("Required when format is 'custom'"),
                recipient_ids: z.array(z.string().max(50)).max(10).optional()
                    .describe("Recipient IDs to forward to. If omitted, uses the default recipient."),
                recipient_email: z.string().email().max(254).optional()
                    .describe("Alternative to recipient_ids: an existing verified recipient email address."),
            },
        },
        async (args) => invokeTool(session, {
            quota: "alias",
            checkBan: "alias",
            rateLimit: "aliasCreate",
        }, async (user) => {
            const alias = await AliasService.createAlias(user.id, {
                domain: args.domain,
                format: args.format === "custom" ? "CUSTOM" : "RANDOM",
                localPart: args.format === "custom" ? args.local_part : undefined,
                recipientIds: args.recipient_ids,
                recipientEmail: args.recipient_email,
            })
            return toolResult(toAddyFormat({
                id: alias.id,
                email: alias.email,
                active: alias.active,
                createdAt: alias.createdAt,
                updatedAt: alias.updatedAt,
            }))
        }),
    )

    server.registerTool(
        "toggle_alias",
        {
            title: "Toggle alias active state",
            description: "Flip an alias between active (forwards mail) and inactive (silently discards). Accepts either the alias ID or the full email address.",
            inputSchema: {
                id: z.string().min(1).describe("Alias ID or full email address"),
            },
        },
        async ({ id }) => invokeTool(session, { quota: "alias", rateLimit: "api" }, async (user) => {
            const existing = await resolveAlias(id, user.id)
            if (!existing) {
                return { content: [{ type: "text" as const, text: "Alias not found" }], isError: true }
            }
            const updated = await AliasService.toggleAlias(user.id, existing.id)
            return toolResult({
                id: updated.id,
                email: updated.email,
                active: updated.active,
            })
        }),
    )

    server.registerTool(
        "delete_alias",
        {
            title: "Delete alias",
            description: "Permanently delete an alias. This cannot be undone — future mail to the address is rejected. Accepts either the alias ID or the full email address.",
            inputSchema: {
                id: z.string().min(1).describe("Alias ID or full email address"),
            },
        },
        async ({ id }) => invokeTool(session, { quota: "alias", rateLimit: "api" }, async (user) => {
            const existing = await resolveAlias(id, user.id)
            if (!existing) {
                return { content: [{ type: "text" as const, text: "Alias not found" }], isError: true }
            }
            await AliasService.deleteAlias(user.id, existing.id)
            return toolResult({ deleted: true, id: existing.id, email: existing.email })
        }),
    )
}
