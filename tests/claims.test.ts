import { describe, it, expect } from "vitest"
import { existsSync } from "fs"
import { resolve } from "path"
import {
    CLAIMS,
    HERO_TRUST_INDICATORS,
    getClaimById,
    getClaimsByProduct,
    getClaimsByCategory,
    getTrustIndicators,
    getVerificationSummary,
} from "@/config/claims"

describe("claims registry", () => {
    it("all claim IDs are unique", () => {
        const ids = CLAIMS.map((c) => c.id)
        const unique = new Set(ids)
        expect(ids.length).toBe(unique.size)
    })

    it("every local verificationPath points to an existing file", () => {
        const root = resolve(__dirname, "..")
        const localClaims = CLAIMS.filter(
            (c) => c.verificationPath && !c.verificationPath.startsWith("http")
        )

        for (const claim of localClaims) {
            const fullPath = resolve(root, claim.verificationPath!)
            expect(existsSync(fullPath), `Claim "${claim.id}" references missing file: ${claim.verificationPath}`).toBe(true)
        }
    })

    it("HERO_TRUST_INDICATORS all resolve to real claims", () => {
        for (const indicator of HERO_TRUST_INDICATORS) {
            const claim = getClaimById(indicator.claimId)
            expect(claim, `Hero indicator "${indicator.label}" references unknown claim: ${indicator.claimId}`).toBeDefined()
        }
    })

    it("no verified_in_repo claim lacks a verificationPath", () => {
        const verified = CLAIMS.filter((c) => c.class === "verified_in_repo")
        for (const claim of verified) {
            expect(claim.verificationPath, `Claim "${claim.id}" is verified_in_repo but has no verificationPath`).toBeDefined()
        }
    })

    it("getTrustIndicators returns only claims with shortLabels for the product", () => {
        const aliasIndicators = getTrustIndicators("alias")
        expect(aliasIndicators.length).toBeGreaterThan(0)
        for (const ind of aliasIndicators) {
            const claim = getClaimById(ind.claimId)
            expect(claim).toBeDefined()
            expect(claim!.shortLabel).toBe(ind.label)
            expect(
                claim!.appliesTo.includes("alias") || claim!.appliesTo.includes("both")
            ).toBe(true)
        }

        const dropIndicators = getTrustIndicators("drop")
        expect(dropIndicators.length).toBeGreaterThan(0)
        for (const ind of dropIndicators) {
            const claim = getClaimById(ind.claimId)
            expect(claim).toBeDefined()
            expect(claim!.shortLabel).toBe(ind.label)
            expect(
                claim!.appliesTo.includes("drop") || claim!.appliesTo.includes("both")
            ).toBe(true)
        }
    })

    it("getClaimsByProduct returns relevant claims", () => {
        const aliasClaims = getClaimsByProduct("alias")
        expect(aliasClaims.length).toBeGreaterThan(0)
        for (const c of aliasClaims) {
            expect(c.appliesTo.includes("alias") || c.appliesTo.includes("both")).toBe(true)
        }
    })

    it("getClaimsByCategory returns claims for each category", () => {
        const crypto = getClaimsByCategory("cryptography")
        expect(crypto.length).toBeGreaterThan(0)
        for (const c of crypto) {
            expect(c.category).toBe("cryptography")
        }
    })

    it("all non-marketing claims have lastVerified set", () => {
        const nonMarketing = CLAIMS.filter((c) => c.class !== "marketing_only")
        for (const claim of nonMarketing) {
            expect(
                claim.lastVerified,
                `Claim "${claim.id}" (${claim.class}) is missing lastVerified`
            ).toBeDefined()
            // Verify ISO date format
            expect(
                /^\d{4}-\d{2}-\d{2}$/.test(claim.lastVerified!),
                `Claim "${claim.id}" has invalid lastVerified format: ${claim.lastVerified}`
            ).toBe(true)
        }
    })

    it("all depends_on_external_infra claims have sourceUrl", () => {
        const external = CLAIMS.filter((c) => c.class === "depends_on_external_infra")
        for (const claim of external) {
            expect(
                claim.sourceUrl,
                `External claim "${claim.id}" is missing sourceUrl`
            ).toBeDefined()
        }
    })

    it("getVerificationSummary counts are consistent", () => {
        const summary = getVerificationSummary()
        expect(summary.verified + summary.external + summary.marketing).toBe(summary.total)
        expect(summary.total).toBe(CLAIMS.length)
    })
})
