---
name: anon-li
description: Manage anon.li email aliases, recipients, and encrypted drop metadata through the MCP server or REST API.
---

# anon.li

Use this skill when the user wants to work with anon.li resources:

- Create, list, toggle, or delete email aliases
- Add or inspect verified recipients
- Review or manage encrypted drop metadata
- Connect an agent to anon.li through MCP

## Prefer MCP when available

If the client supports the Model Context Protocol and the user can complete an
OAuth sign-in, prefer the anon.li MCP server:

`https://anon.li/api/mcp`

This is the safest default for agent-driven workflows because anon.li scopes
access with OAuth and exposes purpose-built tools for aliases, recipients, and
drop management.

Use the MCP documentation for connection details and tool behavior:

- `https://anon.li/docs/api/mcp`

## REST API fallback

If MCP is not available, use the REST API:

- Base URL: `https://anon.li/api/v1`
- Auth: `Authorization: Bearer <api_key>`

Relevant documentation:

- Aliases: `https://anon.li/docs/api/alias`
- Recipients: `https://anon.li/docs/api/recipient`
- Domains: `https://anon.li/docs/api/domain`
- Drops: `https://anon.li/docs/api/drop`

## Constraints

- Alias labels and notes are vault-encrypted client-side and are not available
  to third-party agents unless the user has explicitly provided compatible
  vault material.
- Drop file contents and filenames are end-to-end encrypted and are not exposed
  through MCP.
- Creating or uploading Drop file contents requires client-side encryption.
  Remote agents should not fabricate encryption flows they cannot actually run.

## Good defaults

- Prefer creating aliases with the default recipient unless the user specifies
  another verified destination.
- Prefer MCP for account management and status checks.
- Use REST endpoints for direct application integrations or when the user
  explicitly asks for raw HTTP examples.
- Link the user to anon.li docs when they need endpoint-specific request and
  response details.
