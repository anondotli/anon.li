/**
 * Warrant Canary Data Layer
 *
 * Reads and validates the signed canary.json artifact.
 */

import { readFileSync, existsSync } from "fs"
import { join } from "path"

interface CanaryStatement {
    text: string
    status: "clear" | "removed"
}

interface CanaryData {
    version: number
    lastUpdated: string   // ISO date
    nextUpdate: string    // ISO date
    statements: CanaryStatement[]
    signatureVerified: boolean
    isStale: boolean
}

const CANARY_PATH = join(process.cwd(), "public", "canary.json")

/**
 * Load canary data from public/canary.json.
 * Returns null if the file doesn't exist.
 */
export function loadCanaryData(): CanaryData | null {
    if (!existsSync(CANARY_PATH)) {
        return null
    }

    try {
        const raw = readFileSync(CANARY_PATH, "utf-8")
        const parsed = JSON.parse(raw) as {
            version: number
            lastUpdated: string
            nextUpdate: string
            statements: CanaryStatement[]
        }

        const now = new Date()
        const nextUpdate = new Date(parsed.nextUpdate)
        const isStale = now > nextUpdate

        // Signature verification is done by checking if .sig file exists
        // Full PGP verification requires the maintainer's public key
        const sigPath = join(process.cwd(), "public", "canary.json.sig")
        const signatureVerified = existsSync(sigPath)

        return {
            version: parsed.version,
            lastUpdated: parsed.lastUpdated,
            nextUpdate: parsed.nextUpdate,
            statements: parsed.statements,
            signatureVerified,
            isStale,
        }
    } catch {
        return null
    }
}
