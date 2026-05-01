import { EmailLayout } from "./layout"
import {
    AccentCard,
    ContentRow,
    EmailCTA,
    EmailHeader,
    emailColors,
} from "./primitives"

interface FormSubmissionNotificationEmailProps {
    formTitle: string
    submissionId: string
    dashboardUrl: string
    receivedAt: Date
}

export function FormSubmissionNotificationEmail({
    formTitle,
    submissionId,
    dashboardUrl,
    receivedAt,
}: FormSubmissionNotificationEmailProps) {
    const receivedLabel = receivedAt.toUTCString()

    return (
        <EmailLayout
            title="New form response"
            preheader={`A new encrypted response arrived for "${formTitle}".`}
        >
            <EmailHeader
                icon="&#128228;"
                iconBgColor={emailColors.successBg}
                title="New response"
                subtitle={`Someone submitted "${formTitle}".`}
            />
            <AccentCard label="Submission" accentColor="#2a6f4a" bgColor="#14211a">
                <p style={{ margin: 0, fontSize: "14px", color: emailColors.text }}>
                    {submissionId}
                </p>
                <p style={{ margin: "6px 0 0", fontSize: "12px", color: emailColors.textLight }}>
                    {receivedLabel}
                </p>
            </AccentCard>
            <ContentRow padding="0 48px 24px">
                <p style={{ margin: "0 0 20px", fontSize: "14px", color: emailColors.textLight, lineHeight: 1.6 }}>
                    The response is end-to-end encrypted. Unlock your vault in the dashboard to decrypt and read it.
                </p>
                <EmailCTA href={dashboardUrl}>Open dashboard</EmailCTA>
            </ContentRow>
        </EmailLayout>
    )
}
