import { EmailLayout } from "./layout";
import { emailUrl } from "./styles";
import { EmailHeader, InfoBox, ContentRow, EmailCTA, emailColors } from "./primitives";

interface CryptoPaymentReviewEmailProps {
    product: string;
    tier: string;
}

/**
 * Sent once when a paid crypto invoice is held for review instead of being
 * activated (the account still has a live card subscription), so the customer
 * is not left without an explanation.
 */
export function CryptoPaymentReviewEmail({ product, tier }: CryptoPaymentReviewEmailProps) {
    const planName = `${product.charAt(0).toUpperCase() + product.slice(1)} ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;

    return (
        <EmailLayout title="Payment Under Review" preheader="We received your crypto payment and are reviewing it">
            <EmailHeader
                icon="&#9203;"
                iconBgColor={emailColors.cardBg}
                title="Payment Under Review"
            />
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: "0 0 24px", fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    We received your crypto payment for <strong style={{ color: emailColors.text }}>{planName}</strong>, but your
                    account still has an active card subscription, so we could not activate it automatically.
                </p>
            </ContentRow>
            <InfoBox variant="info" withBorder>
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.6, color: emailColors.text, textAlign: "center" }}>
                    <strong>No action is needed.</strong> Your plan activates automatically once the card subscription has
                    ended, or our support team will contact you to activate or refund it.
                </p>
            </InfoBox>
            <EmailCTA href={emailUrl("/dashboard/billing")} text="View Billing" />
        </EmailLayout>
    );
}
