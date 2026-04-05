import { EmailLayout } from "./layout";
import { EmailHeader, InfoBox, ContentRow, EmailCTA, emailColors } from "./primitives";

interface CryptoRenewalReminderEmailProps {
    daysRemaining: number;
    product: string;
    tier: string;
}

export function CryptoRenewalReminderEmail({ daysRemaining, product, tier }: CryptoRenewalReminderEmailProps) {
    const planName = `${product.charAt(0).toUpperCase() + product.slice(1)} ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;

    return (
        <EmailLayout title="Subscription Expiring Soon" preheader={`Your plan expires in ${daysRemaining} ${daysRemaining === 1 ? "day" : "days"} - renew to keep your features`}>
            <EmailHeader
                icon="&#9200;"
                iconBgColor={emailColors.cardBg}
                title="Subscription Expiring Soon"
            />
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: "0 0 24px", fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Your <strong style={{ color: emailColors.text }}>{planName}</strong> plan expires in <strong style={{ color: emailColors.text }}>{daysRemaining} {daysRemaining === 1 ? "day" : "days"}</strong>.
                </p>
            </ContentRow>
            <InfoBox variant="warning" withBorder>
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.6, color: emailColors.warning, textAlign: "center" }}>
                    <strong>Renew now to keep your features and avoid losing access.</strong>
                </p>
            </InfoBox>
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Crypto subscriptions do not auto-renew. Visit your billing page to renew with crypto or card.
                </p>
            </ContentRow>
            <EmailCTA href="https://anon.li/dashboard/billing" text="Renew Subscription" />
        </EmailLayout>
    );
}
