/**
 * Build-time validation for comparison data.
 * Ensures every comparison entry has required source fields
 * and warns if lastVerified dates are stale (>90 days).
 *
 * Run: bun run scripts/validate-comparisons.ts
 */

import { comparisons } from "../config/comparisons"

const STALE_THRESHOLD_DAYS = 90
const now = new Date()
let hasErrors = false
let hasWarnings = false

for (const entry of comparisons) {
    const prefix = `[${entry.slug}]`

    // Required fields
    if (!entry.sourceUrl) {
        console.error(`${prefix} Missing sourceUrl`)
        hasErrors = true
    }
    if (!entry.sourceName) {
        console.error(`${prefix} Missing sourceName`)
        hasErrors = true
    }
    if (!entry.lastVerified) {
        console.error(`${prefix} Missing lastVerified`)
        hasErrors = true
    }

    // Staleness check
    if (entry.lastVerified) {
        const verifiedDate = new Date(entry.lastVerified)
        const daysSinceVerified = Math.floor((now.getTime() - verifiedDate.getTime()) / (1000 * 60 * 60 * 24))
        if (daysSinceVerified > STALE_THRESHOLD_DAYS) {
            console.warn(`${prefix} lastVerified is ${daysSinceVerified} days old (${entry.lastVerified}). Consider re-verifying.`)
            hasWarnings = true
        }
    }

    // Check feature sections are not empty
    if (entry.comparisonData.features.length === 0) {
        console.error(`${prefix} No feature sections defined`)
        hasErrors = true
    }

    for (const section of entry.comparisonData.features) {
        if (section.items.length === 0) {
            console.error(`${prefix} Empty feature section: "${section.category}"`)
            hasErrors = true
        }
    }
}

if (hasErrors) {
    console.error("\nComparison validation failed. Fix errors above before building.")
    process.exit(1)
}

if (hasWarnings) {
    console.warn("\nComparison validation passed with warnings.")
} else {
    console.log(`Comparison validation passed. ${comparisons.length} entries checked.`)
}
