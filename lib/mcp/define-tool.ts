import type {
    CallToolResult,
    McpServer,
    ScopeChallengeHandler,
    StandardSchemaWithJSON,
    ToolAnnotations,
} from "@modelcontextprotocol/server"
import type { z } from "zod"
import { invokeTool, type InvokeOptions, type McpToolScope } from "./invoke"
import type { McpSession, McpUser } from "./types"

/**
 * Advertise `schema` in `tools/list` (its exact JSON Schema, defaults and
 * descriptions included) while accepting any arguments at the SDK layer.
 *
 * The SDK flattens its own input-validation failures into a bare text error
 * without anon.li's machine-readable `code`. Passing the arguments through
 * untouched moves validation into `invokeTool`, which answers with a
 * structured `VALIDATION_ERROR` — after the scope and rate-limit checks and
 * before any quota is charged.
 */
function lenientInput(schema: z.ZodType): StandardSchemaWithJSON<Record<string, unknown>> {
    const standard = schema["~standard"]
    return {
        "~standard": {
            version: 1,
            vendor: "anon.li",
            validate: (value: unknown) => ({ value: (value ?? {}) as Record<string, unknown> }),
            jsonSchema: standard.jsonSchema,
        },
    }
}

/**
 * HTTP-level step-up for a tool whose scope the token lacks: the transport
 * answers `403` with `WWW-Authenticate: Bearer error="insufficient_scope"`,
 * the scope set to request and `resource_metadata`, so a client can
 * re-authorize instead of surfacing a tool error to the model.
 *
 * The challenge carries the token's granted scopes *plus* the missing one:
 * a client that re-authorizes with exactly the challenged set would
 * otherwise trade its existing grants for the new one.
 */
function scopeChallengeFor(scope: McpToolScope): ScopeChallengeHandler {
    return ({ authInfo }) => {
        // Unauthenticated requests are the auth gate's job (401), not a step-up.
        if (!authInfo) return undefined
        if (authInfo.scopes.includes(scope)) return undefined
        const scopes = Array.from(new Set([...authInfo.scopes, scope]))
        return {
            scopes: scopes as [string, ...string[]],
            errorDescription: `This tool requires the ${scope} scope`,
        }
    }
}

interface McpToolConfig<S extends z.ZodType> {
    title: string
    description: string
    annotations: ToolAnnotations
    inputSchema: S
    outputSchema: StandardSchemaWithJSON
}

type McpToolGate<A> = Omit<InvokeOptions<A>, "input" | "scope"> & { scope: McpToolScope }

/**
 * Register one anon.li tool: the advertised schemas, the HTTP scope
 * challenge, and the shared `invokeTool` gate (which re-checks the scope as a
 * backstop and validates the arguments against `inputSchema`).
 */
export function registerMcpTool<S extends z.ZodType>(
    server: McpServer,
    session: McpSession,
    name: string,
    config: McpToolConfig<S>,
    gate: McpToolGate<z.output<S>>,
    handler: (args: z.output<S>, user: McpUser) => Promise<CallToolResult>,
): void {
    const { inputSchema, ...rest } = config
    server.registerTool(
        name,
        {
            ...rest,
            inputSchema: lenientInput(inputSchema),
            scopeChallenge: scopeChallengeFor(gate.scope),
        },
        async (args) => invokeTool<CallToolResult, z.output<S>>(
            session,
            // S's output is z.output<S> by definition; TS can't see that through the generic.
            { ...gate, input: { schema: inputSchema as z.ZodType<z.output<S>>, args } },
            (user, parsed) => handler(parsed, user),
        ),
    )
}
