/**
 * MCP server factory for anon.li.
 *
 * Creates an McpServer with all tools registered. Tools call the REST API
 * via fetch, so this works both in-app (loopback) and standalone.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { z } from "zod";

interface ApiClient {
  get(path: string): Promise<unknown>;
  post(path: string, body?: unknown): Promise<unknown>;
  patch(path: string, body?: unknown): Promise<unknown>;
  delete(path: string, body?: unknown): Promise<unknown>;
}

function createApiClient(baseUrl: string, apiKey: string): ApiClient {
  async function request(
    method: string,
    path: string,
    body?: unknown
  ): Promise<unknown> {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = (await res.json()) as Record<string, unknown>;

    if (!res.ok) {
      const error = json.error as Record<string, unknown> | undefined;
      throw new Error((error?.message as string) ?? `API error ${res.status}`);
    }

    return json.data ?? json;
  }

  return {
    get: (path) => request("GET", path),
    post: (path, body) => request("POST", path, body),
    patch: (path, body) => request("PATCH", path, body),
    delete: (path, body) => request("DELETE", path, body),
  };
}

function text(value: unknown): { content: { type: "text"; text: string }[] } {
  return {
    content: [
      { type: "text" as const, text: JSON.stringify(value, null, 2) },
    ],
  };
}

export function createMcpServer(baseUrl: string, apiKey: string): McpServer {
  const server = new McpServer({ name: "anon.li", version: "1.0.0" });
  const api = createApiClient(baseUrl, apiKey);

  // ── Aliases ──────────────────────────────────────────────────

  server.tool(
    "list_aliases",
    "List all email aliases for the authenticated user. Returns alias email, active status, labels, recipients, and forwarding stats.",
    async () => text(await api.get("/api/v1/alias"))
  );

  server.tool(
    "create_alias",
    "Create a new email alias. By default creates a random alias on anon.li. Specify format='custom' and local_part to create a custom alias.",
    {
      domain: z
        .string()
        .max(253)
        .optional()
        .describe("Domain for the alias (default: anon.li)"),
      format: z
        .enum(["random", "custom"])
        .optional()
        .describe(
          "'random' generates a random address, 'custom' lets you pick the local part"
        ),
      local_part: z
        .string()
        .max(64)
        .optional()
        .describe(
          "Local part for custom aliases (e.g. 'newsletter' for newsletter@anon.li)"
        ),
      label: z
        .string()
        .max(50)
        .optional()
        .describe("Short label/description for the alias"),
      note: z
        .string()
        .max(500)
        .optional()
        .describe("Private note for your reference"),
      recipient_email: z
        .string()
        .email()
        .optional()
        .describe(
          "Email address to forward mail to. Must be a verified recipient."
        ),
    },
    async (params) => {
      const body: Record<string, unknown> = {
        domain: params.domain ?? "anon.li",
        format: params.format === "custom" ? "custom" : "random_characters",
      };
      if (params.local_part) body.local_part = params.local_part;
      if (params.label) body.description = params.label;
      if (params.note) body.note = params.note;
      if (params.recipient_email)
        body.recipient_email = params.recipient_email;
      return text(await api.post("/api/v1/alias", body));
    }
  );

  server.tool(
    "get_alias",
    "Get details for a single alias by its ID or full email address.",
    { id: z.string().describe("Alias ID (cuid) or full email address") },
    async ({ id }) =>
      text(await api.get(`/api/v1/alias/${encodeURIComponent(id)}`))
  );

  server.tool(
    "update_alias",
    "Update an alias. Can toggle active state, change label/note, or update recipient routing.",
    {
      id: z.string().describe("Alias ID (cuid) or full email address"),
      active: z
        .boolean()
        .optional()
        .describe("Set to true to enable or false to disable forwarding"),
      label: z
        .string()
        .max(50)
        .optional()
        .describe("Update the label/description"),
      note: z
        .string()
        .max(500)
        .optional()
        .describe("Update the private note"),
      recipient_email: z
        .string()
        .email()
        .optional()
        .describe(
          "Change the forwarding destination. Must be a verified recipient."
        ),
    },
    async ({ id, ...updates }) => {
      const body: Record<string, unknown> = {};
      if (updates.active !== undefined) body.active = updates.active;
      if (updates.label !== undefined) body.description = updates.label;
      if (updates.note !== undefined) body.note = updates.note;
      if (updates.recipient_email !== undefined)
        body.recipient_email = updates.recipient_email;
      return text(
        await api.patch(`/api/v1/alias/${encodeURIComponent(id)}`, body)
      );
    }
  );

  server.tool(
    "delete_alias",
    "Permanently delete an alias. This cannot be undone — the alias will stop forwarding immediately.",
    { id: z.string().describe("Alias ID (cuid) or full email address") },
    async ({ id }) => {
      await api.delete(`/api/v1/alias/${encodeURIComponent(id)}`);
      return text(`Alias ${id} deleted successfully.`);
    }
  );

  // ── Drops ────────────────────────────────────────────────────

  server.tool(
    "list_drops",
    "List the authenticated user's encrypted file drops with pagination. Returns drop metadata (titles are encrypted client-side).",
    {
      limit: z
        .number()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of drops to return (default: 50)"),
      offset: z
        .number()
        .min(0)
        .optional()
        .describe("Offset for pagination (default: 0)"),
    },
    async (params) => {
      const query = new URLSearchParams();
      if (params.limit !== undefined) query.set("limit", String(params.limit));
      if (params.offset !== undefined)
        query.set("offset", String(params.offset));
      const qs = query.toString();
      return text(await api.get(`/api/v1/drop${qs ? `?${qs}` : ""}`));
    }
  );

  server.tool(
    "get_drop",
    "Get metadata and file list for a specific drop. Note: file contents are end-to-end encrypted and require the decryption key (in the drop URL fragment) to read.",
    { id: z.string().describe("Drop ID (16-character alphanumeric)") },
    async ({ id }) =>
      text(await api.get(`/api/v1/drop/${encodeURIComponent(id)}`))
  );

  server.tool(
    "delete_drop",
    "Permanently delete a drop and all its files. This cannot be undone — download links will stop working immediately.",
    { id: z.string().describe("Drop ID to delete") },
    async ({ id }) => {
      await api.delete(`/api/v1/drop/${encodeURIComponent(id)}`);
      return text(`Drop ${id} deleted successfully.`);
    }
  );

  server.tool(
    "toggle_drop",
    "Enable or disable a drop's download link. When disabled, the link returns a 'not found' error. This is reversible.",
    { id: z.string().describe("Drop ID to toggle") },
    async ({ id }) =>
      text(
        await api.patch(
          `/api/v1/drop/${encodeURIComponent(id)}?action=toggle`
        )
      )
  );

  // ── Recipients ───────────────────────────────────────────────

  server.tool(
    "list_recipients",
    "List all email recipients (forwarding destinations). Shows verification status, PGP key info, and how many aliases route to each recipient.",
    async () => text(await api.get("/api/v1/recipient"))
  );

  server.tool(
    "create_recipient",
    "Add a new email recipient (forwarding destination). A verification email will be sent — the recipient must click the link before it can be used with aliases.",
    { email: z.string().email().describe("Email address to add as a recipient") },
    async ({ email }) =>
      text(await api.post("/api/v1/recipient", { email }))
  );

  // ── Domains ──────────────────────────────────────────────────

  server.tool(
    "list_domains",
    "List all custom domains. Shows verification status for ownership, MX, SPF, and DKIM records.",
    async () => text(await api.get("/api/v1/domain"))
  );

  server.tool(
    "get_domain",
    "Get details for a specific domain including DNS verification status and required DNS records.",
    { id: z.string().describe("Domain ID") },
    async ({ id }) =>
      text(await api.get(`/api/v1/domain/${encodeURIComponent(id)}`))
  );

  server.tool(
    "verify_domain",
    "Trigger DNS verification for a domain. Checks MX, SPF, and DKIM records. Run this after updating your DNS records.",
    { id: z.string().describe("Domain ID to verify") },
    async ({ id }) =>
      text(
        await api.post(`/api/v1/domain/${encodeURIComponent(id)}/verify`)
      )
  );

  // ── Account ──────────────────────────────────────────────────

  server.tool(
    "get_account",
    "Get the authenticated user's account information including plan tier, usage statistics (aliases, drops, storage, domains, recipients), and plan limits.",
    async () => text(await api.get("/api/v1/me"))
  );

  return server;
}
