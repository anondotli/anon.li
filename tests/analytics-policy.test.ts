import { describe, expect, it } from "vitest"

import { shouldEnableAnalytics } from "@/lib/analytics-policy"

describe("shouldEnableAnalytics", () => {
    it("disables analytics on sensitive routes", () => {
        expect(shouldEnableAnalytics("/drop")).toBe(false)
        expect(shouldEnableAnalytics("/drop/upload")).toBe(false)
        expect(shouldEnableAnalytics("/d/abc123")).toBe(false)
        expect(shouldEnableAnalytics("/login")).toBe(false)
        expect(shouldEnableAnalytics("/dashboard/settings")).toBe(false)
        expect(shouldEnableAnalytics("/api/v1/drop")).toBe(false)
        expect(shouldEnableAnalytics("/setup")).toBe(false)
        expect(shouldEnableAnalytics("/verify-recipient")).toBe(false)
    })

    it("keeps analytics enabled on non-sensitive pages", () => {
        expect(shouldEnableAnalytics("/")).toBe(true)
        expect(shouldEnableAnalytics("/pricing")).toBe(true)
        expect(shouldEnableAnalytics("/blog/security-architecture")).toBe(true)
        expect(shouldEnableAnalytics("/alias")).toBe(true)
    })
})
