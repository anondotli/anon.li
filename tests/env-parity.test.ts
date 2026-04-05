import { describe, it, expect } from "vitest"
import { readFileSync } from "fs"
import { resolve } from "path"
import { globSync } from "glob"

/**
 * Ensures every `process.env.X` reference in the codebase is either
 * declared in lib/env.ts schemas or in the explicit allowlist below.
 *
 * Prevents environment variables from being used without validation,
 * which can cause cryptic runtime errors.
 */

// Variables managed by Next.js/Node.js runtime — not ours to validate
const FRAMEWORK_VARS = new Set([
    "NODE_ENV",
    "NEXT_RUNTIME",
    "NEXT_PHASE",
    "VERCEL",
    "VERCEL_ENV",
    "VERCEL_URL",
    "CI",
])

// Variables only used in test setup files
const TEST_ONLY_VARS = new Set([
    "RESEND_API_KEY",
])

// Variables only used in one-time setup scripts (not runtime)
const SCRIPT_ONLY_VARS = new Set([
    "CLOUDFLARE_ACCOUNT_ID",
    "CLOUDFLARE_API_TOKEN",
    "R2_CORS_ALLOWED_ORIGINS",
])

const ALLOWLIST = new Set([...FRAMEWORK_VARS, ...TEST_ONLY_VARS, ...SCRIPT_ONLY_VARS])

function getEnvVarsFromSchema(): Set<string> {
    const envTs = readFileSync(resolve(__dirname, "../lib/env.ts"), "utf-8")
    const varNames = new Set<string>()

    // Match property names in z.object({ KEY: z... })
    const matches = envTs.matchAll(/^\s+(\w+):\s*z\./gm)
    for (const match of matches) {
        varNames.add(match[1]!)
    }
    return varNames
}

function getEnvVarsFromCode(): Map<string, string[]> {
    const root = resolve(__dirname, "..")
    const files = globSync("**/*.{ts,tsx}", {
        cwd: root,
        ignore: [
            "node_modules/**",
            ".next/**",
            "out/**",
            "build/**",
            "extension/**",
            "cli/**",
            "haraka/**",
            "tests/**",
            "vitest.setup.ts",
            "anon-video/**",
        ],
    })

    const envUsage = new Map<string, string[]>()

    for (const file of files) {
        const content = readFileSync(resolve(root, file), "utf-8")
        const matches = content.matchAll(/process\.env\.(\w+)/g)
        for (const match of matches) {
            const varName = match[1]!
            if (!envUsage.has(varName)) {
                envUsage.set(varName, [])
            }
            envUsage.get(varName)!.push(file)
        }
    }

    return envUsage
}

describe("env parity", () => {
    it("all process.env references are declared in env.ts or allowlisted", () => {
        const schemaVars = getEnvVarsFromSchema()
        const codeVars = getEnvVarsFromCode()

        const undeclared: string[] = []

        for (const [varName, files] of codeVars) {
            if (!schemaVars.has(varName) && !ALLOWLIST.has(varName)) {
                undeclared.push(`${varName} (used in: ${files.join(", ")})`)
            }
        }

        expect(undeclared, `Undeclared env vars found. Add them to lib/env.ts or the test allowlist:\n${undeclared.join("\n")}`).toEqual([])
    })
})
