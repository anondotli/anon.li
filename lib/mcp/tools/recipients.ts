import { z } from "zod"
import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { RecipientService } from "@/lib/services/recipient"
import { invokeTool, toolResult } from "@/lib/mcp/invoke"
import type { McpSession } from "@/lib/mcp/types"

export function registerRecipientTools(server: McpServer, session: McpSession) {
    server.registerTool(
        "list_recipients",
        {
            title: "List recipients",
            description: "List recipient email addresses that aliases can forward to. Only verified recipients can be used as alias destinations.",
            inputSchema: {},
        },
        async () => invokeTool(session, { rateLimit: "recipientOps" }, async (user) => {
            const recipients = await RecipientService.getRecipients(user.id)
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
            inputSchema: {
                email: z.string().email().max(254),
            },
        },
        async ({ email }) => invokeTool(session, { rateLimit: "recipientOps" }, async (user) => {
            const recipient = await RecipientService.addRecipient(user.id, email)
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
