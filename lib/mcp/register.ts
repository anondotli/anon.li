import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js"
import { registerAliasTools } from "./tools/aliases"
import { registerRecipientTools } from "./tools/recipients"
import { registerDropTools } from "./tools/drops"
import { registerFormTools } from "./tools/forms"
import type { McpSession } from "./types"

export function registerAllTools(server: McpServer, session: McpSession) {
    registerAliasTools(server, session)
    registerRecipientTools(server, session)
    registerDropTools(server, session)
    registerFormTools(server, session)
}
