import { EmailLayout } from "./layout";
import { EmailHeader, ContentRow, EmailCTA, emailColors } from "./primitives";

interface CryptoInvoiceExpiredEmailProps {
    product: string;
    tier: string;
    priceUsd: number;
}

export function CryptoInvoiceExpiredEmail({ product, tier, priceUsd }: CryptoInvoiceExpiredEmailProps) {
    const planName = `${product.charAt(0).toUpperCase() + product.slice(1)} ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;

    return (
        <EmailLayout
            title="Your crypto invoice expired"
            preheader="Want to finish with a card instead? It takes 30 seconds."
        >
            <EmailHeader
                icon="&#128179;"
                iconBgColor={emailColors.cardBg}
                title="Want to finish with a card?"
            />
            <ContentRow padding="0 48px 24px">
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Your <strong style={{ color: emailColors.text }}>{planName}</strong> crypto invoice for
                    {" "}<strong style={{ color: emailColors.text }}>${priceUsd.toFixed(2)}</strong> expired without a payment landing.
                </p>
            </ContentRow>
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Still want the plan? Checkout with a card is instant &mdash; same plan, no on-chain wait.
                    You can also retry crypto from the same page.
                </p>
            </ContentRow>
            <EmailCTA href="https://anon.li/dashboard/billing" text="Finish with a card" />
        </EmailLayout>
    );
}
