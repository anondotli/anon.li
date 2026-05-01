import { EmailLayout } from "./layout";
import { EmailHeader, InfoBox, FileInfoCard, AccentCard, EmailCTA, ContentRow, emailColors } from "./primitives";

interface FormTakedownEmailProps {
    formId: string;
    formTitle: string;
    reason: string;
    strikeCount: number;
    isBanned: boolean;
}

export function FormTakedownEmail({ formId, formTitle, reason, strikeCount, isBanned }: FormTakedownEmailProps) {
    const strikesRemaining = 3 - strikeCount;

    return (
        <EmailLayout title="Form Removed" preheader="A form has been removed from your account due to a policy violation">
            <EmailHeader
                icon="&#9888;&#65039;"
                iconBgColor={emailColors.errorBg}
                title="Form Removed"
                subtitle="Your form has been removed due to a policy violation."
            />
            <InfoBox variant={isBanned ? "error" : "warning"}>
                {isBanned ? (
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: emailColors.error }}>
                        &#9940; Your account has been permanently suspended due to repeated violations.
                    </p>
                ) : (
                    <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: emailColors.warning }}>
                        &#9888;&#65039; Strike {strikeCount} of 3 - {strikesRemaining === 1 ? "1 more violation" : `${strikesRemaining} more violations`} will result in a permanent ban.
                    </p>
                )}
            </InfoBox>
            <FileInfoCard
                icon="&#128196;"
                iconBgColor={emailColors.errorBg}
                title={formTitle}
                subtitle={`Form ID: ${formId} — This form has been permanently removed and no longer accepts submissions.`}
            />
            <AccentCard label="Reason for Removal" accentColor="#812b2a" bgColor="#1d1413">
                {reason}
            </AccentCard>
            <ContentRow padding="0 48px 48px">
                <p style={{ margin: "0 0 20px", fontSize: "14px", color: emailColors.textLight, lineHeight: 1.6 }}>
                    Please review our Acceptable Use Policy to understand our content guidelines.
                </p>
                <EmailCTA href="https://anon.li/docs/legal/aup" variant="secondary">
                    View Acceptable Use Policy
                </EmailCTA>
            </ContentRow>
        </EmailLayout>
    );
}
