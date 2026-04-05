/**
 * POST /api/mcp — Streamable HTTP MCP endpoint (stateless)
 *
 * Serves the anon.li MCP server for Claude Connectors and other remote
 * MCP clients. Authentication via API key (Bearer ak_...).
 */

import {
  WebStandardStreamableHTTPServerTransport,
} from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { createMcpServer } from "@/lib/mcp/server";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const apiKey = req.headers.get("authorization")?.replace("Bearer ", "");

  if (!apiKey?.startsWith("ak_")) {
    return Response.json(
      {
        jsonrpc: "2.0",
        error: {
          code: -32001,
          message:
            "Valid anon.li API key required. Set the Authorization header to 'Bearer ak_...'",
        },
        id: null,
      },
      { status: 401 }
    );
  }

  const baseUrl = new URL(req.url).origin;
  const server = createMcpServer(baseUrl, apiKey);

  const transport = new WebStandardStreamableHTTPServerTransport({
    sessionIdGenerator: undefined,
  });

  await server.connect(transport);
  return transport.handleRequest(req);
}

export async function GET() {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "GET not supported in stateless mode. Use POST.",
      },
      id: null,
    },
    { status: 405 }
  );
}

export async function DELETE() {
  return Response.json(
    {
      jsonrpc: "2.0",
      error: {
        code: -32000,
        message: "Session management not supported in stateless mode.",
      },
      id: null,
    },
    { status: 405 }
  );
}
