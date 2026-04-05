import { EmailLayout } from "./layout";
import { EmailHeader, InfoBox, ContentRow, EmailCTA, emailColors } from "./primitives";

interface SubscriptionCanceledEmailProps {
    expiryDate: string;
}

export function SubscriptionCanceledEmail({ expiryDate }: SubscriptionCanceledEmailProps) {
    return (
        <EmailLayout title="Subscription Ended" preheader="Your subscription has ended - renew before your files are deleted">
            <EmailHeader
                icon="&#9888;&#65039;"
                iconBgColor={emailColors.cardBg}
                title="Subscription Ended"
            />
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: "0 0 24px", fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Your anon.li subscription has been canceled or your payment could not be processed.
                </p>
            </ContentRow>
            <InfoBox variant="warning" withBorder>
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.6, color: emailColors.warning, textAlign: "center" }}>
                    <strong>Your files will be permanently deleted on {expiryDate}</strong> unless you renew your subscription.
                </p>
            </InfoBox>
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Restore your Pro features by updating your payment method before the deadline.
                </p>
            </ContentRow>
            <EmailCTA href="https://anon.li/dashboard/billing" text="Renew Subscription" />
        </EmailLayout>
    );
}
