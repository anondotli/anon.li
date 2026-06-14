/**
 * @vitest-environment node
 *
 * Purchase-first Teams: an org with no active Business subscription is a
 * zero-capacity workspace. assertOrgPlanActive is the shared choke point every
 * org-scope create path (alias/recipient/domain/drop/form) calls before checking
 * its numeric limit, so the gate can't be bypassed by adding a new resource type.
 */
import { describe, expect, it } from "vitest"
import { assertOrgPlanActive } from "@/lib/limits"
import { UpgradeRequiredError } from "@/lib/api-error-utils"

describe("assertOrgPlanActive (purchase-first Teams gate)", () => {
    it("throws a 402 UpgradeRequiredError for an org with no active subscription", () => {
        let thrown: unknown
        try {
            assertOrgPlanActive({ subscriptions: [] }, "aliases", "alias_random")
        } catch (err) {
            thrown = err
        }
        expect(thrown).toBeInstanceOf(UpgradeRequiredError)
        expect((thrown as UpgradeRequiredError).statusCode).toBe(402)
        expect((thrown as UpgradeRequiredError).message).toContain("Business subscription")
    })

    it("does not throw when the org has at least one active subscription", () => {
        expect(() =>
            assertOrgPlanActive(
                { subscriptions: [{ status: "active", product: "business", tier: "pro" }] },
                "drops",
                "drop_file_size",
            ),
        ).not.toThrow()
    })
})
