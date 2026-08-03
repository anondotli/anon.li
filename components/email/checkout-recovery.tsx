import { EmailLayout } from "./layout";
import { emailUrl } from "./styles";
import { EmailHeader, ContentRow, EmailCTA, FooterNote, emailColors } from "./primitives";

interface CheckoutRecoveryEmailProps {
    /** e.g. "bundle" / "form" / "business"; null when the plan can't be resolved */
    product: string | null;
    /** e.g. "plus" / "pro"; null when the plan can't be resolved */
    tier: string | null;
    unsubscribeUrl?: string;
}

function capitalize(value: string): string {
    return value.charAt(0).toUpperCase() + value.slice(1);
}

/**
 * Abandoned-checkout recovery email — sent once, ~24 h after a checkout session
 * expires unpaid. Written in the founder's voice on purpose ("Everything OK?"):
 * a question, not a nudge; the free tier is honestly fine forever, and the copy
 * says so. No urgency theater, no fake scarcity.
 */
export function CheckoutRecoveryEmail({ product, tier, unsubscribeUrl }: CheckoutRecoveryEmailProps) {
    const planName = product && tier ? `${capitalize(product)} ${capitalize(tier)}` : null;
    const pricingUrl = product && tier
        ? emailUrl(`/pricing?highlight=${product}_${tier}`)
        : emailUrl("/pricing");

    return (
        <EmailLayout
            title="Everything OK?"
            preheader="Your checkout expired — your plan is still here if you want it."
            unsubscribeUrl={unsubscribeUrl}
        >
            <EmailHeader
                icon="&#128172;"
                iconBgColor={emailColors.cardBg}
                title="Everything OK?"
            />
            <ContentRow padding="0 48px 24px">
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Your{planName ? <strong style={{ color: emailColors.text }}> {planName}</strong> : ""} checkout
                    expired before the payment went through. Cards get declined, tabs get closed,
                    life happens &mdash; no problem at all.
                </p>
            </ContentRow>
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    If you still want it, your plan is exactly where you left it &mdash; same price,
                    nothing lost. And if you changed your mind, genuinely no hard feelings:
                    the free tier is designed to be usable forever.
                </p>
            </ContentRow>
            <EmailCTA href={pricingUrl} text={planName ? `Continue with ${planName}` : "See plans"} />
            <FooterNote>
                If something didn&apos;t work, or you have a question before you decide, just reply
                to this email &mdash; it comes straight to me, the founder.
            </FooterNote>
        </EmailLayout>
    );
}
