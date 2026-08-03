/** @vitest-environment node */
import { describe, expect, it } from "vitest"

import { UpgradeRequiredError } from "@/lib/api-error-utils"
import { apiErrorFromUnknown } from "@/lib/api-response"

describe("standard API errors", () => {
    it("preserves structured upgrade guidance", async () => {
        const response = apiErrorFromUnknown(new UpgradeRequiredError(
            "File uploads require an upgrade.",
            {
                scope: "form_file_uploads",
                currentTier: "free",
                suggestedTier: "plus",
                currentValue: 10,
                limitValue: 0,
            },
        ), "req-test")

        expect(response.status).toBe(402)
        expect(await response.json()).toEqual({
            error: {
                message: "File uploads require an upgrade.",
                code: "PAYMENT_REQUIRED",
                details: {
                    upgrade: {
                        scope: "form_file_uploads",
                        currentTier: "free",
                        suggestedTier: "plus",
                        currentValue: 10,
                        limitValue: 0,
                    },
                },
            },
            meta: { request_id: "req-test" },
        })
    })
})
