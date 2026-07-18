import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { sendEmail } from "@/lib/resend"
import { getOrgAdminEmails } from "@/lib/data/organization"

const logger = createLogger("FormNotifications")

// Notify a form's owner that a new submission arrived. Submission content is
// E2EE, so the server cannot see answers; the email only carries metadata
// (form title, submission id, timestamp, link).
export async function notifyFormSubmission(formId: string, submissionId: string): Promise<void> {
    try {
        const form = await prisma.form.findUnique({
            where: { id: formId },
            select: {
                id: true,
                title: true,
                notifyAliasId: true,
                notifyEmailFallback: true,
                organizationId: true,
                user: { select: { email: true } },
            },
        })
        if (!form) return

        const notifyOnSubmission = form.notifyEmailFallback || form.notifyAliasId !== null
        if (!notifyOnSubmission) return
        const recipients = form.organizationId
            ? await getOrgAdminEmails(form.organizationId)
            : form.user?.email
              ? [form.user.email]
              : []
        if (recipients.length === 0) return

        const { FormSubmissionNotificationEmail } = await import("@/components/email/form-submission")
        const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL}/dashboard/form/${form.id}`
        const results = await Promise.all(recipients.map((recipient) => sendEmail({
            to: recipient,
            subject: `New response to "${form.title}"`,
            react: FormSubmissionNotificationEmail({
                formTitle: form.title,
                submissionId,
                dashboardUrl,
                receivedAt: new Date(),
            }),
        })))
        if (results.some((result) => !result.success)) {
            logger.warn("Form notification email failed", { formId, submissionId })
        }
    } catch (err) {
        logger.error("Failed to notify form submission", { formId, submissionId, error: err })
    }
}
