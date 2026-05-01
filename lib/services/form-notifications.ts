import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/logger"
import { sendEmail } from "@/lib/resend"

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
                user: { select: { email: true } },
            },
        })
        if (!form) return

        const notifyOnSubmission = form.notifyEmailFallback || form.notifyAliasId !== null
        const recipient = notifyOnSubmission ? form.user.email : null
        if (!recipient) return

        const { FormSubmissionNotificationEmail } = await import("@/components/email/form-submission")
        const dashboardUrl = `${process.env.NEXT_PUBLIC_APP_URL ?? "https://anon.li"}/dashboard/form/${form.id}`
        const result = await sendEmail({
            to: recipient,
            subject: `New response to "${form.title}"`,
            react: FormSubmissionNotificationEmail({
                formTitle: form.title,
                submissionId,
                dashboardUrl,
                receivedAt: new Date(),
            }),
        })
        if (!result.success) {
            logger.warn("Form notification email failed", { formId, submissionId })
        }
    } catch (err) {
        logger.error("Failed to notify form submission", { formId, submissionId, error: err })
    }
}
