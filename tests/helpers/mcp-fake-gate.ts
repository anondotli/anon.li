import type { z } from "zod"

interface FakeGateOptions {
    input?: { schema: z.ZodType; args: unknown }
}

/**
 * Stand-in for `invokeTool` in tool-registration tests: skips auth/quota but
 * keeps the argument contract — validates `opts.input` like the real gate
 * (structured VALIDATION_ERROR on failure) and hands the parsed args to the
 * handler.
 */
export function fakeGate<U>(user: U) {
    return async (
        _session: unknown,
        opts: FakeGateOptions | undefined,
        handler: (user: U, args?: unknown) => Promise<unknown>,
    ) => {
        if (!opts?.input) return handler(user)
        const parsed = opts.input.schema.safeParse(opts.input.args ?? {})
        if (!parsed.success) {
            const message = `Invalid arguments: ${parsed.error.issues
                .map((issue) => `${issue.path.map(String).join(".")}: ${issue.message}`)
                .join("; ")}`
            return {
                content: [{ type: "text" as const, text: message }],
                isError: true,
                _meta: { "anon.li/error": { code: "VALIDATION_ERROR", message } },
            }
        }
        return handler(user, parsed.data)
    }
}
