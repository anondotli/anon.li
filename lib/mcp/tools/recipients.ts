import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { RecipientService } from "@/lib/services/recipient"
import { invokeTool, toolResult } from "@/lib/mcp/invoke"
import { personalScope } from "@/lib/ownership"
import type { McpSession } from "@/lib/mcp/types"

export function registerRecipientTools(server: McpServer, session: McpSession) {
    server.registerTool(
        "list_recipients",
        {
            title: "List recipients",
            description: "List recipient email addresses that aliases can forward to. Only verified recipients can be used as alias destinations.",
            annotations: { readOnlyHint: true, openWorldHint: false },
            inputSchema: {},
            outputSchema: {
                total: z.number(),
                recipients: z.array(z.object({
                    id: z.string(),
                    email: z.string(),
                    verified: z.boolean(),
                    is_default: z.boolean(),
                    has_pgp: z.boolean(),
                    created_at: z.string(),
                })),
            },
        },
        async () => invokeTool(session, { scope: "anon.li:aliases", rateLimit: "recipientOps" }, async (user) => {
            const recipients = await RecipientService.getRecipients(personalScope(user.id))
            return toolResult({
                total: recipients.length,
                recipients: recipients.map((r) => ({
                    id: r.id,
                    email: r.email,
                    verified: r.verified,
                    is_default: r.isDefault,
                    has_pgp: Boolean(r.pgpFingerprint),
                    created_at: r.createdAt.toISOString(),
                })),
            })
        }),
    )

    server.registerTool(
        "add_recipient",
        {
            title: "Add recipient",
            description: "Add a new recipient email. The user will receive a verification email at that address; the recipient cannot be used for aliases until they click the verification link.",
            annotations: { openWorldHint: false },
            inputSchema: {
                email: z.string().email().max(254),
            },
            outputSchema: {
                id: z.string(),
                email: z.string(),
                verified: z.boolean(),
                verification_sent: z.boolean(),
                message: z.string(),
            },
        },
        async ({ email }) => invokeTool(session, { scope: "anon.li:aliases", rateLimit: "recipientOps" }, async (user) => {
            const recipient = await RecipientService.addRecipient(personalScope(user.id), email)
            return toolResult({
                id: recipient.id,
                email: recipient.email,
                verified: recipient.verified,
                verification_sent: true,
                message: "Verification email sent. The recipient must click the link before this address can receive alias mail.",
            })
        }),
    )
}
