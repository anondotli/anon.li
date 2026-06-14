/**
 * @vitest-environment node
 *
 * Input-validation guarantees for custom-domain creation: malformed domains and
 * the reserved apex (anon.li) must be rejected before any DB / DKIM work runs.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { userFindUnique, domainCount } = vi.hoisted(() => ({
    userFindUnique: vi.fn(),
    domainCount: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique: userFindUnique },
        domain: { count: domainCount },
        $transaction: vi.fn(),
    },
}))

import { DomainService } from "@/lib/services/domain"
import { ValidationError } from "@/lib/api-error-utils"
import { personalScope } from "@/lib/ownership"

const scope = personalScope("user-1")

describe("DomainService.createDomain validation", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("rejects a malformed domain before touching the database", async () => {
        await expect(DomainService.createDomain(scope, "not_a_domain")).rejects.toBeInstanceOf(ValidationError)
        expect(userFindUnique).not.toHaveBeenCalled()
        expect(domainCount).not.toHaveBeenCalled()
    })

    it("rejects an uppercase / spaced domain", async () => {
        await expect(DomainService.createDomain(scope, "Bad Domain.com")).rejects.toBeInstanceOf(ValidationError)
        expect(userFindUnique).not.toHaveBeenCalled()
    })

    it("rejects the reserved apex domain anon.li", async () => {
        await expect(DomainService.createDomain(scope, "anon.li")).rejects.toMatchObject({
            message: expect.stringContaining("reserved"),
        })
        // Reserved check short-circuits before the plan-limit lookup.
        expect(userFindUnique).not.toHaveBeenCalled()
    })
})
