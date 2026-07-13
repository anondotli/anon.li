/**
 * @vitest-environment node
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const { domainsCron, billingCron, dripCron, cryptoCron } = vi.hoisted(() => ({
    domainsCron: vi.fn(),
    billingCron: vi.fn(),
    dripCron: vi.fn(),
    cryptoCron: vi.fn(),
}))

vi.mock("@/lib/cron-lock", () => ({
    withCronLock: vi.fn(async (_name: string, _ttl: number, job: () => unknown) => job()),
}))
vi.mock("@/lib/services/cron-domains", () => ({ handleDomainsCron: domainsCron }))
vi.mock("@/lib/services/cron-billing", () => ({ handleBillingCron: billingCron }))
vi.mock("@/lib/services/cron-drip", () => ({ handleDripCron: dripCron }))
vi.mock("@/lib/services/cron-crypto-recovery", () => ({ handleCryptoRecoveryCron: cryptoCron }))

import { GET } from "@/app/api/cron/daily/route"

const originalCronSecret = process.env.CRON_SECRET

describe("daily cron failure reporting", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.CRON_SECRET = "test-cron-secret"
        domainsCron.mockResolvedValue({ processed: 1 })
        billingCron.mockResolvedValue({ processed: 1 })
        dripCron.mockResolvedValue({ processed: 1 })
        cryptoCron.mockResolvedValue({ processed: 1 })
    })

    afterEach(() => {
        process.env.CRON_SECRET = originalCronSecret
    })

    it("returns a failed run when a subtask throws", async () => {
        billingCron.mockRejectedValue(new Error("billing database unavailable"))

        const response = await GET(new Request("http://localhost/api/cron/daily", {
            headers: { authorization: "Bearer test-cron-secret" },
        }) as never)
        const body = await response.json()

        expect(response.status).toBe(500)
        expect(body.success).toBe(false)
        expect(body.errors).toEqual(["billing"])
        expect(domainsCron).toHaveBeenCalledOnce()
        expect(cryptoCron).toHaveBeenCalledOnce()
    })
})
