import { describe, expect, it } from "vitest"

import { getClaimById } from "@/config/claims"
import {
    DASHBOARD_FEATURE_PROMPTS,
    DROP_PRO_LIMIT_LABELS,
    FEATURE_CATALOG,
    IMPORTANT_FEATURE_IDS,
    getFeatureById,
} from "@/config/features"
import { PLAN_ENTITLEMENTS } from "@/config/plans"

describe("feature presentation catalog", () => {
    it("uses unique feature ids", () => {
        const ids = FEATURE_CATALOG.map((feature) => feature.id)
        expect(new Set(ids).size).toBe(ids.length)
    })

    it("references real claim ids", () => {
        for (const feature of FEATURE_CATALOG) {
            for (const claimId of feature.claimIds ?? []) {
                expect(
                    getClaimById(claimId),
                    `Feature "${feature.id}" references unknown claim "${claimId}"`
                ).toBeDefined()
            }
        }
    })

    it("keeps important feature coverage focused on core privacy value", () => {
        const important = IMPORTANT_FEATURE_IDS.map((id) => getFeatureById(id))

        expect(important.every(Boolean)).toBe(true)
        expect(new Set(important.map((feature) => feature?.product))).toEqual(
            new Set(["alias", "drop", "trust"])
        )
        expect(important.every((feature) => feature?.priority === "primary")).toBe(true)
    })

    it("keeps developer tools discoverable but not primary", () => {
        const developerFeatures = FEATURE_CATALOG.filter((feature) => feature.product === "developer")

        expect(developerFeatures.map((feature) => feature.id)).toEqual([
            "developer_rest_api",
            "developer_cli",
            "developer_extension",
            "developer_mcp",
        ])
        expect(developerFeatures.every((feature) => feature.priority === "tertiary")).toBe(true)
        expect(IMPORTANT_FEATURE_IDS.some((id) => id.startsWith("developer_"))).toBe(false)
    })

    it("keeps dashboard prompt ids resolvable", () => {
        for (const ids of Object.values(DASHBOARD_FEATURE_PROMPTS)) {
            for (const id of ids) {
                expect(getFeatureById(id), `Unknown dashboard prompt feature "${id}"`).toBeDefined()
            }
        }
    })

    it("derives Drop upgrade expiry wording from plan entitlements", () => {
        expect(DROP_PRO_LIMIT_LABELS.expiry).toBe(
            `Up to ${PLAN_ENTITLEMENTS.drop.pro.maxExpiryDays}-day expiry`
        )

        const serialized = JSON.stringify(FEATURE_CATALOG)
        expect(serialized).not.toMatch(/keep files forever/i)
        expect(serialized).not.toMatch(/no expiry/i)
    })
})
