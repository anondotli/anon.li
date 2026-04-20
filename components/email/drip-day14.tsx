import { EmailLayout } from "./layout";
import {
    EmailSimpleHeader,
    EmailDivider,
    Section,
    FeatureRow,
    EmailCTAInline,
    ContentRow,
    emailTextStyles,
    FooterNote,
} from "./primitives";

interface DripDay14EmailProps {
    unsubscribeUrl?: string;
}

export function DripDay14Email({ unsubscribeUrl }: DripDay14EmailProps) {
    return (
        <EmailLayout
            title="Free is great. Here's when Plus earns its keep."
            preheader="Custom domains, PGP encryption, more aliases, bigger drops."
            unsubscribeUrl={unsubscribeUrl}
        >
            <EmailSimpleHeader
                title="Free covers the basics. Plus covers the edges."
                subtitle="No nagging &mdash; just a quick map of where Free stops being enough."
            />
            <EmailDivider />

            <ContentRow>
                <p style={emailTextStyles.body}>
                    Most people are fine on Free forever. But if you&apos;ve already
                    thought &ldquo;I wish I had a custom domain&rdquo; or &ldquo;this
                    file is too big to drop&rdquo; &mdash; Plus is designed for that.
                </p>
            </ContentRow>

            <Section title="What you get on Plus for $3.99/mo">
                <FeatureRow
                    icon="&#127760;"
                    title="Custom domains"
                    description="Route aliases through your own domain &mdash; up to 3 domains, branded forwarding."
                />
                <FeatureRow
                    icon="&#128273;"
                    title="PGP-encrypted forwarding"
                    description="Attach your public key &mdash; inbound mail is encrypted before forwarding."
                />
                <FeatureRow
                    icon="&#128202;"
                    title="10&times; the aliases, bigger drops"
                    description="100 random aliases, 10 custom, 50 GB drops, 7-day expiry."
                />
                <FeatureRow
                    icon="&#128272;"
                    title="Password-protected drops"
                    description="Add an extra passphrase layer on top of E2EE."
                    isLast
                />
            </Section>

            <EmailCTAInline href="https://anon.li/pricing" text="See all plans" />

            <FooterNote>
                If Free is working for you, keep using it &mdash; no pressure. This is the only
                upgrade nudge you&apos;ll get from the welcome series.
            </FooterNote>
        </EmailLayout>
    );
}
