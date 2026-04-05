import { EmailLayout } from "./layout";
import { EmailSimpleHeader, EmailCTA, EmailDivider, FooterNote } from "./primitives";

interface RecipientVerificationEmailProps {
    verificationUrl: string;
    recipientEmail: string;
}

export function RecipientVerificationEmail({ verificationUrl, recipientEmail }: RecipientVerificationEmailProps) {
    return (
        <EmailLayout title="Verify your email address" preheader="Verify this email to receive forwarded messages from anon.li">
            <EmailSimpleHeader
                title="Verify your email address"
                subtitle={`We need to verify that ${recipientEmail} belongs to you before we can forward emails to it.`}
            />
            <EmailCTA href={verificationUrl} text="Verify Email" />
            <EmailDivider />
            <FooterNote>
                This link expires in 24 hours. If you didn&apos;t add this email as a forwarding recipient on anon.li, you can safely ignore this email.
            </FooterNote>
        </EmailLayout>
    );
}
