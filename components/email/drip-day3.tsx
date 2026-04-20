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

interface DripDay3EmailProps {
    unsubscribeUrl?: string;
}

export function DripDay3Email({ unsubscribeUrl }: DripDay3EmailProps) {
    return (
        <EmailLayout
            title="Send a file without anyone else seeing it"
            preheader="End-to-end encrypted file drops. Even we can't read them."
            unsubscribeUrl={unsubscribeUrl}
        >
            <EmailSimpleHeader
                title="Send a file. Privately."
                subtitle="Drops are end-to-end encrypted in your browser. We never see the contents."
            />
            <EmailDivider />

            <ContentRow>
                <p style={emailTextStyles.body}>
                    The recipient gets a link. The decryption key lives in the link&apos;s
                    fragment — the part after the <code>#</code> — so it never hits our servers.
                    You can set a password, a download limit, and an expiry.
                </p>
            </ContentRow>

            <Section title="Good times to use a drop">
                <FeatureRow
                    icon="&#128196;"
                    title="Sending a passport or contract"
                    description="E2EE + expiry means it can't live forever on someone's cloud."
                />
                <FeatureRow
                    icon="&#128273;"
                    title="Sharing credentials with a teammate"
                    description="Set a single download limit so it self-destructs."
                />
                <FeatureRow
                    icon="&#128225;"
                    title="Tipping a journalist or researcher"
                    description="No account required on the receiver's side."
                    isLast
                />
            </Section>

            <EmailCTAInline href="https://anon.li/dashboard/drop" text="Upload your first drop" />

            <FooterNote>
                Free includes 5 GB bandwidth and 3-day expiry. No registration required for downloaders.
            </FooterNote>
        </EmailLayout>
    );
}
