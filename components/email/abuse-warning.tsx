import { EmailLayout } from "./layout";
import { EmailHeader, InfoBox, AccentCard, ContentRow, EmailCTA, emailColors } from "./primitives";

interface AbuseWarningEmailProps {
    reason: string;
}

export function AbuseWarningEmail({ reason }: AbuseWarningEmailProps) {
    return (
        <EmailLayout title="Policy Warning" preheader="We've received a report about content on your account">
            <EmailHeader
                icon="&#9888;&#65039;"
                iconBgColor={emailColors.warningBg}
                title="Policy Warning"
                subtitle="We've received a report regarding content associated with your account."
            />
            <InfoBox variant="warning">
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: emailColors.warning }}>
                    This is a warning. No action has been taken against your account at this time.
                </p>
            </InfoBox>
            <AccentCard label="Details" accentColor="#87681a" bgColor="#1e1a11">
                {reason}
            </AccentCard>
            <ContentRow padding="0 48px 48px">
                <p style={{ margin: "0 0 20px", fontSize: "14px", color: emailColors.textLight, lineHeight: 1.6 }}>
                    Please review our Acceptable Use Policy to ensure your content complies with our guidelines.
                    Repeated violations may result in content removal or account restrictions.
                </p>
                <EmailCTA href="https://anon.li/docs/legal/aup" variant="secondary">
                    View Acceptable Use Policy
                </EmailCTA>
            </ContentRow>
        </EmailLayout>
    );
}
