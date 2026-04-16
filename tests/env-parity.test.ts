import { describe, it, expect } from "vitest"
import { readdirSync, readFileSync } from "fs"
import { relative, resolve } from "path"

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
const IGNORED_SOURCE_DIRS = new Set([
    ".git",
    ".next",
    "anon-video",
    "build",
    "cli",
    "extension",
    "haraka",
    "node_modules",
    "out",
    "tests",
])

function findSourceFiles(root: string, directory = root): string[] {
    const files: string[] = []

    for (const entry of readdirSync(directory, { withFileTypes: true })) {
        const fullPath = resolve(directory, entry.name)
        const relativePath = relative(root, fullPath).replace(/\\/g, "/")

        if (entry.isDirectory()) {
            if (!IGNORED_SOURCE_DIRS.has(relativePath)) {
                files.push(...findSourceFiles(root, fullPath))
            }
            continue
        }

        if (entry.isFile() && relativePath !== "vitest.setup.ts" && /\.(ts|tsx)$/.test(entry.name)) {
            files.push(relativePath)
        }
    }

    return files.sort()
}

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

function getEnvVarsFromExample(): Set<string> {
    const envExample = readFileSync(resolve(__dirname, "../.env.example"), "utf-8")
    const varNames = new Set<string>()
    const matches = envExample.matchAll(/^([A-Z0-9_]+)=/gm)

    for (const match of matches) {
        varNames.add(match[1]!)
    }

    return varNames
}

function getEnvVarsFromCode(): Map<string, string[]> {
    const root = resolve(__dirname, "..")
    const files = findSourceFiles(root)

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

    it("documents every server env schema key in .env.example", () => {
        const schemaVars = getEnvVarsFromSchema()
        const exampleVars = getEnvVarsFromExample()

        const missing = [...schemaVars]
            .filter((name) => !name.startsWith("NEXT_PUBLIC_"))
            .filter((name) => !exampleVars.has(name))
            .sort()

        expect(missing, `Missing env vars in .env.example:\n${missing.join("\n")}`).toEqual([])
    })
})
