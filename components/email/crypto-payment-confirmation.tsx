import { EmailLayout } from "./layout";
import { EmailHeader, InfoBox, ContentRow, EmailCTA, emailColors } from "./primitives";

interface CryptoPaymentConfirmationEmailProps {
    product: string;
    tier: string;
    periodEnd: string;
}

export function CryptoPaymentConfirmationEmail({ product, tier, periodEnd }: CryptoPaymentConfirmationEmailProps) {
    const planName = `${product.charAt(0).toUpperCase() + product.slice(1)} ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;

    return (
        <EmailLayout title="Payment Confirmed" preheader="Your crypto payment is confirmed and your plan is active">
            <EmailHeader
                icon="&#9989;"
                iconBgColor={emailColors.cardBg}
                title="Payment Confirmed"
            />
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: "0 0 24px", fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Your crypto payment has been confirmed and your <strong style={{ color: emailColors.text }}>{planName}</strong> plan is now active.
                </p>
            </ContentRow>
            <InfoBox variant="success" withBorder>
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.6, color: emailColors.success, textAlign: "center" }}>
                    <strong>Your plan is active until {periodEnd}</strong>
                </p>
            </InfoBox>
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Crypto subscriptions do not auto-renew. You will receive a reminder before your plan expires so you can renew.
                </p>
            </ContentRow>
            <EmailCTA href="https://anon.li/dashboard/billing" text="View Subscription" />
        </EmailLayout>
    );
}
