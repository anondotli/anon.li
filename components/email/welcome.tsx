import { EmailLayout } from "./layout";
import { EmailSimpleHeader, EmailDivider, Section, FeatureRow, EmailCTAInline } from "./primitives";

export function WelcomeEmail() {
    return (
        <EmailLayout title="Welcome to anon.li" preheader="Your privacy toolkit is ready - aliases, encrypted files, and more">
            <EmailSimpleHeader
                title="Welcome to anon.li"
                subtitle="You've taken the first step toward reclaiming your online privacy."
            />
            <EmailDivider />
            <Section title="What you can do now">
                <FeatureRow
                    icon="&#128231;"
                    title="Email Aliases"
                    description="Generate private addresses for signups, newsletters, and more."
                />
                <FeatureRow
                    icon="&#128193;"
                    title="Encrypted Files"
                    description="Share files with end-to-end encryption. We never see your content."
                />
                <FeatureRow
                    icon="&#128274;"
                    title="PGP Encryption"
                    description="Add your public key for encrypted email forwarding."
                    isLast
                />
            </Section>
            <EmailCTAInline href="https://anon.li/dashboard/alias" text="Go to Dashboard" />
        </EmailLayout>
    );
}
