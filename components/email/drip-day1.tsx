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

interface DripDay1EmailProps {
    unsubscribeUrl?: string;
}

export function DripDay1Email({ unsubscribeUrl }: DripDay1EmailProps) {
    return (
        <EmailLayout
            title="Create your first alias"
            preheader="Thirty seconds to a throwaway email address — no signups, no spam."
            unsubscribeUrl={unsubscribeUrl}
        >
            <EmailSimpleHeader
                title="Your first alias takes 30 seconds"
                subtitle="Next time a site asks for an email, give it one you can burn."
            />
            <EmailDivider />

            <ContentRow>
                <p style={emailTextStyles.body}>
                    An alias is a private forwarding address. Mail sent to it lands
                    in your real inbox — but the sender never sees your real address.
                    Getting spammed? Disable the alias, and it&apos;s gone forever.
                </p>
            </ContentRow>

            <Section title="Three ways aliases save you">
                <FeatureRow
                    icon="&#9998;"
                    title="Signups on sketchy sites"
                    description="Use a random alias. If they start spamming, kill it."
                />
                <FeatureRow
                    icon="&#128231;"
                    title="Newsletters &amp; free trials"
                    description="Route them to a label so your inbox stays clean."
                />
                <FeatureRow
                    icon="&#128104;"
                    title="Marketplaces &amp; forums"
                    description="Keep your real address out of public profiles."
                    isLast
                />
            </Section>

            <EmailCTAInline href="https://anon.li/dashboard/alias" text="Create your first alias" />

            <FooterNote>
                You have 10 free random aliases and 1 custom alias to start.
            </FooterNote>
        </EmailLayout>
    );
}
