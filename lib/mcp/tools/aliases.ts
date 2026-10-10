import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/server"
import { AliasService } from "@/lib/services/alias"
import { resolveAlias } from "@/app/api/v1/alias/_utils"
import { invokeTool, toolError, toolResult } from "@/lib/mcp/invoke"
import { personalScope } from "@/lib/ownership"
import { LOCAL_PART_PATTERN } from "@/lib/validations/alias"
import type { McpSession } from "@/lib/mcp/types"

/**
 * The alias projection this server advertises. It is deliberately NOT
 * `toAddyFormat` from the REST API: that formatter carries Addy.io
 * compatibility keys (`description`, `label`, `note`, `encrypted_label`,
 * `encrypted_note`, `metadata_version`) which the declared `outputSchema`
 * does not list. The SDK compiles every tool's `outputSchema` with
 * `additionalProperties: false` and validates `structuredContent` against it,
 * so echoing those keys makes the whole call fail with -32602 in official MCP
 * clients — the server looks healthy yet returns nothing to the agent.
 */
const aliasShape = {
    id: z.string(),
    email: z.string(),
    active: z.boolean(),
    created_at: z.string(),
    updated_at: z.string(),
}

/**
 * Alias addresses are stored lowercase and looked up by exact match, so an
 * address typed (or echoed back by a model) as `Jane.Doe@anon.li` would
 * otherwise report NOT_FOUND. IDs are case-sensitive and pass through as-is.
 */
function normalizeAliasIdentifier(identifier: string): string {
    const trimmed = identifier.trim()
    return trimmed.includes("@") ? trimmed.toLowerCase() : trimmed
}

const aliasIdentifier = z.string().trim().min(1).max(320)
    .describe("Alias ID (from list_aliases) or the full alias email address, e.g. 'jane.doe@anon.li'")

function toAliasFields(alias: {
    id: string
    email: string
    active: boolean
    createdAt: Date
    updatedAt: Date
}) {
    return {
        id: alias.id,
        email: alias.email,
        active: alias.active,
        created_at: alias.createdAt.toISOString(),
        updated_at: alias.updatedAt.toISOString(),
    }
}

export function registerAliasTools(server: McpServer, session: McpSession) {
    server.registerTool(
        "list_aliases",
        {
            title: "List aliases",
            description:
                "List the email aliases owned by the authenticated user, newest first. Returns one page of aliases with id, email, active state, received/blocked counters, and timestamps, plus `total` (the number of aliases on the account) — page with `offset` while offset + returned < total. Labels and notes are omitted because they are vault-encrypted client-side and cannot be read by a third-party client.",
            annotations: {
                title: "List aliases",
                readOnlyHint: true,
                openWorldHint: false,
            },
            inputSchema: z.object({
                limit: z.number().int().min(1).max(100).default(50)
                    .describe("Maximum number of aliases to return (1-100, default 50)"),
                offset: z.number().int().min(0).default(0)
                    .describe("Number of aliases to skip, for pagination (default 0)"),
            }),
            outputSchema: z.object({
                total: z.number(),
                aliases: z.array(z.object({
                    ...aliasShape,
                    emails_received: z.number(),
                    emails_blocked: z.number(),
                    last_email_at: z.string().nullable(),
                })),
            }),
        },
        async ({ limit, offset }) => invokeTool(session, { scope: "anon.li:aliases", quota: "alias", rateLimit: "api" }, async (user) => {
            const scope = personalScope(user.id)
            const [aliases, total] = await Promise.all([
                AliasService.getAliases(scope, { limit, offset }),
                AliasService.countAliases(scope),
            ])
            return toolResult({
                total,
                aliases: aliases.map((a) => ({
                    ...toAliasFields(a),
                    emails_received: a.emailsReceived,
                    emails_blocked: a.emailsBlocked,
                    last_email_at: a.lastEmailAt?.toISOString() ?? null,
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
            annotations: {
                title: "Create alias",
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false,
            },
            inputSchema: z.object({
                domain: z.string().trim().toLowerCase().min(1).max(253).default("anon.li")
                    .describe("Domain for the alias: 'anon.li' (default) or one of the user's verified custom domains"),
                format: z.enum(["random", "custom"]).default("random")
                    .describe("'random' (default) generates the local part; 'custom' uses `local_part`"),
                local_part: z.string().trim().toLowerCase().max(64)
                    .regex(LOCAL_PART_PATTERN, "lowercase letters, numbers, and single dots only (not at start/end)")
                    .optional()
                    .describe("Required when format is 'custom'. Lowercase letters and numbers, with single dots as separators (e.g. 'jane.doe'); no leading, trailing, or consecutive dots."),
                recipient_ids: z.array(z.string().min(1).max(50)).max(10).optional()
                    .describe("Recipient IDs to forward to. If omitted, uses the default recipient."),
                recipient_email: z.string().trim().toLowerCase().email().max(254).optional()
                    .describe("Alternative to recipient_ids: an existing verified recipient email address."),
            }),
            outputSchema: z.object(aliasShape),
        },
        async (args) => invokeTool(session, {
            scope: "anon.li:aliases",
            quota: "alias",
            checkBan: "alias",
            rateLimit: "aliasCreate",
        }, async (user) => {
            if (args.format === "custom" && !args.local_part) {
                return toolError({ code: "VALIDATION_ERROR", message: "local_part is required when format is 'custom'" })
            }
            const alias = await AliasService.createAlias(personalScope(user.id), {
                domain: args.domain,
                format: args.format === "custom" ? "CUSTOM" : "RANDOM",
                localPart: args.format === "custom" ? args.local_part : undefined,
                recipientIds: args.recipient_ids,
                recipientEmail: args.recipient_email,
            })
            return toolResult(toAliasFields(alias))
        }),
    )

    server.registerTool(
        "toggle_alias",
        {
            title: "Toggle alias",
            description: "Flip an alias between active (forwards mail) and inactive (silently discards). Each call inverts the current state, so check `active` from list_aliases first and do not repeat the call to \"make sure\". Returns the new state. Accepts either the alias ID or the full email address.",
            annotations: {
                title: "Toggle alias",
                readOnlyHint: false,
                destructiveHint: false,
                idempotentHint: false,
                openWorldHint: false,
            },
            inputSchema: z.object({
                id: aliasIdentifier,
            }),
            outputSchema: z.object({
                id: z.string(),
                email: z.string(),
                active: z.boolean(),
            }),
        },
        async ({ id }) => invokeTool(session, { scope: "anon.li:aliases", quota: "alias", rateLimit: "api" }, async (user) => {
            const existing = await resolveAlias(normalizeAliasIdentifier(id), personalScope(user.id))
            if (!existing) {
                return toolError({ code: "NOT_FOUND", message: `No alias '${id}' on this account` })
            }
            const updated = await AliasService.toggleAlias(personalScope(user.id), existing.id)
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
            description: "Permanently delete an alias. This cannot be undone — future mail to the address is rejected. Accepts either the alias ID or the full email address. This tool is flagged destructive (annotations.destructiveHint): MCP clients request user approval before executing it, and fail the call with 'No approval received' — without contacting this server — if approval is denied or unavailable (e.g. headless sessions). Nothing is deleted in that case; approve the client's permission prompt, or allowlist this tool in the client's permissions for unattended use.",
            annotations: {
                title: "Delete alias",
                readOnlyHint: false,
                destructiveHint: true,
                idempotentHint: true,
                openWorldHint: false,
            },
            inputSchema: z.object({
                id: aliasIdentifier,
            }),
            outputSchema: z.object({
                deleted: z.boolean(),
                id: z.string(),
                email: z.string(),
            }),
        },
        async ({ id }) => invokeTool(session, { scope: "anon.li:aliases", quota: "alias", rateLimit: "api" }, async (user) => {
            const existing = await resolveAlias(normalizeAliasIdentifier(id), personalScope(user.id))
            if (!existing) {
                return toolError({ code: "NOT_FOUND", message: `No alias '${id}' on this account` })
            }
            await AliasService.deleteAlias(personalScope(user.id), existing.id)
            return toolResult({ deleted: true, id: existing.id, email: existing.email })
        }),
    )
}
