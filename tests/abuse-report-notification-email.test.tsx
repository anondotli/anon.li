/**
 * @vitest-environment jsdom
 *
 * The staff abuse-report alert links to the matching admin report and shows
 * only the fields it is given.
 */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render } from "@testing-library/react"
import { AbuseReportNotificationEmail } from "@/components/email/abuse-report-notification"

afterEach(() => {
    cleanup()
})

describe("AbuseReportNotificationEmail", () => {
    it("shows the report fields and links to the filtered admin report list", () => {
        const { container } = render(
            <AbuseReportNotificationEmail
                serviceType="alias"
                resourceId="spam@⁠anon.⁠li"
                searchId="spam@anon.li"
                reason="spam"
                priority="normal"
            />,
        )

        expect(container.textContent).toContain("alias")
        expect(container.textContent).toContain("spam@⁠anon.⁠li")
        expect(container.textContent).toContain("normal")

        const link = container.querySelector("a[href*='/admin/reports']")
        expect(link?.getAttribute("href")).toMatch(/\/admin\/reports\?type=alias&search=spam%40anon\.li$/)
    })
})
