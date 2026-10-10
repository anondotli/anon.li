/**
 * @vitest-environment jsdom
 *
 * Domain lifecycle emails state the real cleanup grace period.
 */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { DomainUnverifiedEmail } from "@/components/email/domain-unverified"
import { DomainDeletedEmail } from "@/components/email/domain-deleted"
import { REVOKED_DOMAIN_GRACE_DAYS } from "@/lib/constants"

afterEach(() => {
    cleanup()
})

describe("domain emails", () => {
    it("tells the owner how long they have to re-verify", () => {
        const { container } = render(<DomainUnverifiedEmail domain="example.com" />)

        expect(container.textContent).toContain(`within ${REVOKED_DOMAIN_GRACE_DAYS} days`)
        expect(container.textContent).toContain("example.com")
    })

    it("explains both deletion causes, including the revoked-domain grace period", () => {
        const { container } = render(<DomainDeletedEmail domain="example.com" />)

        expect(container.textContent).toContain("within 24 hours")
        expect(container.textContent).toContain(`within ${REVOKED_DOMAIN_GRACE_DAYS} days`)
    })
})
