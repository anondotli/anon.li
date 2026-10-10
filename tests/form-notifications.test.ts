/**
 * Form submission notifications: the user-controlled form title must not be
 * able to inject headers or plant clickable links/bidi tricks in the email.
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { formFindUnique, sendEmail } = vi.hoisted(() => ({
    formFindUnique: vi.fn(),
    sendEmail: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({ prisma: { form: { findUnique: formFindUnique } } }))
vi.mock("@/lib/resend", () => ({ sendEmail }))
vi.mock("@/lib/data/organization", () => ({ getOrgAdminEmails: vi.fn() }))
vi.mock("@/components/email/form-submission", () => ({
    FormSubmissionNotificationEmail: (props: unknown) => ({ props }),
}))

import { notifyFormSubmission } from "@/lib/services/form-notifications"

describe("notifyFormSubmission", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        sendEmail.mockResolvedValue({ success: true })
    })

    it("sanitizes the form title in the subject and the email body", async () => {
        formFindUnique.mockResolvedValue({
            id: "form-1",
            title: "Claim your prize at evil.com\r\nBcc: victim@example.com‮",
            notifyAliasId: null,
            notifyEmailFallback: true,
            organizationId: null,
            user: { email: "owner@example.com" },
        })

        await notifyFormSubmission("form-1", "sub-1")

        expect(sendEmail).toHaveBeenCalledTimes(1)
        const { subject, react } = sendEmail.mock.calls[0]![0] as {
            subject: string
            react: { props: { formTitle: string } }
        }
        expect(subject).not.toMatch(/[\r\n]/)
        expect(subject).not.toContain("evil.com")
        expect(subject).not.toContain("‮")
        expect(react.props.formTitle).not.toContain("evil.com")
        expect(react.props.formTitle).not.toMatch(/[\r\n‮]/)
        expect(react.props.formTitle).toContain("Claim your prize")
    })
})
