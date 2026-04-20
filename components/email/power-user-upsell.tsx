import { EmailLayout } from "./layout";
import {
    EmailSimpleHeader,
    EmailDivider,
    Section,
    FeatureRow,
    EmailCTAInline,
    StatBox,
    FooterNote,
    emailColors,
    emailTextStyles,
} from "./primitives";

interface PowerUserUpsellEmailProps {
    aliasCount: number;
    emailsForwarded: number;
    suggestedTier: "plus" | "pro";
    aliasLimit: number;
    price: string;
    unsubscribeUrl?: string;
}

export function PowerUserUpsellEmail({
    aliasCount,
    emailsForwarded,
    suggestedTier,
    aliasLimit,
    price,
    unsubscribeUrl,
}: PowerUserUpsellEmailProps) {
    const planLabel = suggestedTier === "pro" ? "Pro" : "Plus";
    const headlineStat = emailsForwarded >= aliasCount
        ? `${emailsForwarded.toLocaleString()} emails forwarded`
        : `${aliasCount.toLocaleString()} aliases in use`;

    return (
        <EmailLayout
            title="You're getting real value from anon.li"
            preheader={`${headlineStat} — here's what ${planLabel} unlocks.`}
            unsubscribeUrl={unsubscribeUrl}
        >
            <EmailSimpleHeader
                title="Your aliases are earning their keep"
                subtitle={`You've put anon.li to work. ${planLabel} lifts the ceiling so you don't have to think about limits.`}
            />
            <EmailDivider />

            <tr>
                <td style={{ padding: "32px 48px 8px" }}>
                    <p style={emailTextStyles.body}>
                        A quick look at your anon.li activity:
                    </p>
                </td>
            </tr>

            <StatBox
                value={aliasCount.toLocaleString()}
                label="active aliases"
                color={emailColors.text}
                bgColor={emailColors.cardBg}
            />
            <StatBox
                value={emailsForwarded.toLocaleString()}
                label="emails forwarded privately"
                color={emailColors.success}
                bgColor={emailColors.successBg}
            />

            <Section title={`What ${planLabel} adds`}>
                <FeatureRow
                    icon="&#9999;"
                    title={`${aliasLimit} random aliases`}
                    description={`Create ${aliasLimit} private aliases instead of the 10 on Free — no more rationing signups.`}
                />
                <FeatureRow
                    icon="&#127760;"
                    title="Custom domains"
                    description="Bring your own domain for branded aliases like me@yourdomain.com."
                />
                <FeatureRow
                    icon="&#128274;"
                    title="PGP-encrypted forwarding"
                    description="Attach your public key and have inbound mail encrypted before it reaches your inbox."
                />
                <FeatureRow
                    icon="&#128190;"
                    title="More drop bandwidth & longer expiry"
                    description="Bigger E2EE file drops that live for longer, with password protection and no branding."
                    isLast
                />
            </Section>

            <EmailCTAInline
                href={`https://anon.li/pricing?highlight=alias_${suggestedTier}`}
                text={`Upgrade to ${planLabel} — ${price}`}
            />

            <FooterNote>
                You&apos;re getting this because your aliases have been doing real work.
                You can keep using the Free plan as long as you like — this is just a heads-up.
            </FooterNote>
        </EmailLayout>
    );
}
