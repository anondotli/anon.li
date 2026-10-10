import { describe, expect, it } from "vitest"

import { DROP_FEATURES } from "@/config/plans"
import { UpgradeRequiredError } from "@/lib/api-error-utils"
import { apiErrorFromUnknown } from "@/lib/api-response"
import { enforceFeatureFlags } from "@/lib/drop-utils"

describe("enforceFeatureFlags", () => {
    it("rejects a password-protected drop on a plan without customKey instead of silently stripping it", () => {
        let thrown: unknown
        try {
            enforceFeatureFlags({ customKey: true }, DROP_FEATURES.free, "free")
        } catch (error) {
            thrown = error
        }

        expect(thrown).toBeInstanceOf(UpgradeRequiredError)
        expect((thrown as UpgradeRequiredError).statusCode).toBe(402)
        expect((thrown as UpgradeRequiredError).details).toMatchObject({
            scope: "drop_custom_key",
            currentTier: "free",
            suggestedTier: "plus",
        })
    })

    it("maps the rejection to a 402 PAYMENT_REQUIRED API error", async () => {
        let thrown: unknown
        try {
            enforceFeatureFlags({ customKey: true }, DROP_FEATURES.free, "free")
        } catch (error) {
            thrown = error
        }

        const response = apiErrorFromUnknown(thrown, "req_test")
        expect(response.status).toBe(402)
        await expect(response.json()).resolves.toMatchObject({
            error: {
                code: "PAYMENT_REQUIRED",
                details: { upgrade: { scope: "drop_custom_key" } },
            },
        })
    })

    it("rejects customKey for guests", () => {
        expect(() => enforceFeatureFlags({ customKey: true }, DROP_FEATURES.guest, "guest"))
            .toThrow(UpgradeRequiredError)
    })

    it("keeps customKey on plans that allow it", () => {
        expect(enforceFeatureFlags({ customKey: true }, DROP_FEATURES.plus, "plus").customKey).toBe(true)
    })

    it("still silently downgrades cosmetic and notification flags", () => {
        expect(enforceFeatureFlags(
            { hideBranding: true, notifyOnDownload: true },
            DROP_FEATURES.free,
            "free",
        )).toEqual({ hideBranding: false, notifyOnDownload: false, customKey: false })
    })
})
