import { EmailLayout } from "./layout";
import { EmailHeader, ContentRow, EmailCTA, InfoBox, emailColors } from "./primitives";

interface CryptoInvoiceReminderEmailProps {
    product: string;
    tier: string;
    priceUsd: number;
    payCurrency: string;
    hoursPending: number;
}

export function CryptoInvoiceReminderEmail({
    product,
    tier,
    priceUsd,
    payCurrency,
    hoursPending,
}: CryptoInvoiceReminderEmailProps) {
    const planName = `${product.charAt(0).toUpperCase() + product.slice(1)} ${tier.charAt(0).toUpperCase() + tier.slice(1)}`;
    const currencyLabel = payCurrency && payCurrency !== "pending" ? payCurrency.toUpperCase() : "crypto";

    return (
        <EmailLayout
            title="Your crypto payment is still pending"
            preheader={`We haven't seen your ${currencyLabel} payment land yet — pick up where you left off.`}
        >
            <EmailHeader
                icon="&#8987;"
                iconBgColor={emailColors.cardBg}
                title="Your payment is waiting"
            />
            <ContentRow padding="0 48px 24px">
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    You started a <strong style={{ color: emailColors.text }}>{planName}</strong> checkout
                    {hoursPending >= 24 ? ` about ${Math.floor(hoursPending / 24)} day${Math.floor(hoursPending / 24) === 1 ? "" : "s"} ago` : ""}
                    {" "}
                    for <strong style={{ color: emailColors.text }}>${priceUsd.toFixed(2)}</strong>, but we haven&apos;t seen the {currencyLabel} transaction on-chain yet.
                </p>
            </ContentRow>
            <InfoBox variant="info" withBorder>
                <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.6, color: emailColors.textMuted, textAlign: "center" }}>
                    Crypto invoices expire after 7 days. If you already sent the payment, you can ignore this &mdash; confirmations can take a while on congested networks.
                </p>
            </InfoBox>
            <EmailCTA href="https://anon.li/dashboard/billing" text="Open billing" />
        </EmailLayout>
    );
}
