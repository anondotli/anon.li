import { EmailLayout } from "./layout";
import { EmailSimpleHeader, EmailCTA, EmailDivider, FooterNote } from "./primitives";

interface MagicLinkEmailProps {
    url: string;
    host: string;
}

export function MagicLinkEmail({ url, host }: MagicLinkEmailProps) {
    return (
        <EmailLayout title={`Sign in to ${host}`} preheader="Use this link to sign in to your anon.li account">
            <EmailSimpleHeader
                title={`Sign in to ${host}`}
                subtitle="Click the button below to sign in to your account."
            />
            <EmailCTA href={url} text="Sign in" />
            <EmailDivider />
            <FooterNote>
                If you didn&apos;t request this email, you can safely ignore it.
            </FooterNote>
        </EmailLayout>
    );
}
