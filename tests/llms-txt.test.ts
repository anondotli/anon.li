import { describe, expect, it } from "vitest"

import { GET } from "@/app/llms.txt/route"
import { BUNDLE_PLANS, BUSINESS_SEAT_PRICE, FORM_PLANS } from "@/config/plans"

describe("llms.txt", () => {
    it("is generated from plan config and lists every product and doc section", async () => {
        const response = await GET()
        const body = await response.text()

        expect(response.headers.get("content-type")).toBe("text/plain; charset=utf-8")

        expect(body).toContain(`$${BUNDLE_PLANS.plus.price.monthly.toFixed(2)}/month`)
        expect(body).toContain(`$${FORM_PLANS.pro.price.yearly.toFixed(2)}/year`)
        expect(body).toContain(`$${BUSINESS_SEAT_PRICE.monthly.toFixed(2)}/seat/month`)

        for (const url of [
            "https://anon.li/form",
            "https://anon.li/mcp",
            "https://anon.li/business",
            "https://anon.li/docs/api/form",
            "https://anon.li/docs/api/mcp",
            "https://anon.li/blog/introducing-form",
            "https://anon.li/privacy",
        ]) {
            expect(body).toContain(`(${url})`)
        }
        expect(body).not.toContain("/index)")
        expect(body).not.toContain("/docs/legal/privacy")
    })
})
