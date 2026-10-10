/**
 * @vitest-environment node
 *
 * Re-verification revoke must stamp `unverifiedAt` (starting the cleanup grace
 * period) and count `{ success: false }` notification sends as errors.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { domainCount, domainFindMany, domainUpdate, resolveTxt, sendDomainUnverifiedEmail } = vi.hoisted(() => ({
    domainCount: vi.fn(),
    domainFindMany: vi.fn(),
    domainUpdate: vi.fn(),
    resolveTxt: vi.fn(),
    sendDomainUnverifiedEmail: vi.fn(),
}))

vi.mock("dns", () => ({ default: { resolveTxt }, resolveTxt }))
vi.mock("@/lib/prisma", () => ({
    prisma: {
        domain: { count: domainCount, findMany: domainFindMany, update: domainUpdate },
    },
}))
vi.mock("@/lib/resend", () => ({
    sendDomainDeletedEmail: vi.fn(),
    sendDomainUnverifiedEmail,
}))
vi.mock("@/lib/data/organization", () => ({ getOrgAdminEmails: vi.fn() }))

import { reverifyActiveDomains } from "@/lib/services/cron-domains"

describe("reverifyActiveDomains revocation", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        domainCount.mockResolvedValue(1)
        domainFindMany.mockResolvedValue([{
            id: "d1",
            domain: "example.com",
            verificationToken: "tok",
            organizationId: null,
            user: { email: "owner@example.com" },
        }])
        // Node-style callback: TXT record no longer present.
        resolveTxt.mockImplementation((_domain: string, cb: (err: Error | null, records?: string[][]) => void) => {
            cb(null, [["something-else"]])
        })
    })

    it("revokes with an unverifiedAt timestamp so cleanup grants a grace period", async () => {
        sendDomainUnverifiedEmail.mockResolvedValue({ success: true })

        const results = await reverifyActiveDomains()

        expect(results).toMatchObject({ checked: 1, revoked: 1, errors: 0 })
        expect(domainUpdate).toHaveBeenCalledWith({
            where: { id: "d1" },
            data: expect.objectContaining({
                verified: false,
                ownershipVerified: false,
                unverifiedAt: expect.any(Date),
            }),
        })
    })

    it("counts a `{ success: false }` notification as an error", async () => {
        sendDomainUnverifiedEmail.mockResolvedValue({ success: false, error: new Error("boom") })

        const results = await reverifyActiveDomains()

        expect(results).toMatchObject({ revoked: 1, errors: 1 })
    })
})
