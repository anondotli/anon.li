/**
 * @vitest-environment node
 *
 * Growth-email exclusions come from GROWTH_EMAIL_EXCLUDE, not hardcoded
 * personal addresses in source.
 */
import { afterEach, describe, expect, it, vi } from "vitest"

const { redisGet, redisSet } = vi.hoisted(() => ({ redisGet: vi.fn(), redisSet: vi.fn() }))
vi.mock("@upstash/redis", () => ({ Redis: class { get = redisGet; set = redisSet } }))
vi.mock("@/lib/data/user", () => ({ getHeavyFreeUsers: vi.fn().mockResolvedValue([]), getDripCohort: vi.fn().mockResolvedValue([]) }))
vi.mock("@/lib/resend", () => ({
    sendPowerUserUpsellEmail: vi.fn(),
    sendDripDay1Email: vi.fn(),
    sendDripDay3Email: vi.fn(),
    sendDripDay7Email: vi.fn(),
    sendDripDay14Email: vi.fn(),
}))

import { getGrowthEmailExcludeList } from "@/lib/growth-email-exclude"
import { getDripCohort, getHeavyFreeUsers } from "@/lib/data/user"
import { handleDripCron } from "@/lib/services/cron-drip"
import { handleHeavyUserUpsellCron } from "@/lib/services/cron-heavy-user-upsell"

afterEach(() => {
    vi.unstubAllEnvs()
})

describe("getGrowthEmailExcludeList", () => {
    it("is empty when unset or blank", () => {
        expect(getGrowthEmailExcludeList(undefined)).toEqual([])
        expect(getGrowthEmailExcludeList("")).toEqual([])
        expect(getGrowthEmailExcludeList(" , ,")).toEqual([])
    })

    it("splits, trims, lowercases and dedupes", () => {
        expect(getGrowthEmailExcludeList(" Staff@Example.com, review@example.org ,staff@example.com"))
            .toEqual(["staff@example.com", "review@example.org"])
    })
})

describe("growth crons honor GROWTH_EMAIL_EXCLUDE", () => {
    it("passes the configured list to the drip cohort and upsell queries", async () => {
        vi.stubEnv("GROWTH_EMAIL_EXCLUDE", "a@example.com,B@example.com")

        await handleDripCron()
        await handleHeavyUserUpsellCron()

        expect(vi.mocked(getDripCohort)).toHaveBeenCalledWith(
            expect.objectContaining({ excludeEmails: ["a@example.com", "b@example.com"] }),
        )
        expect(vi.mocked(getHeavyFreeUsers)).toHaveBeenCalledWith(
            expect.objectContaining({ excludeEmails: ["a@example.com", "b@example.com"] }),
        )
    })
})
