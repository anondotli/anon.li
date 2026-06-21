import { EmailLayout } from "./layout";
import {
    EmailCTA,
    EmailDivider,
    EmailHeader,
    FooterNote,
    emailColors,
} from "./primitives";

interface AccountVerificationEmailProps {
    url: string;
}

export function AccountVerificationEmail({ url }: AccountVerificationEmailProps) {
    return (
        <EmailLayout
            title="Verify your anon.li email address"
            preheader="Confirm your email to finish setting up your anon.li account"
        >
            <EmailHeader
                icon="&#9993;&#65039;"
                iconBgColor={emailColors.cardBg}
                title="Verify your email"
                subtitle="Confirm your email address to finish setting up your anon.li account."
            />
            <EmailCTA href={url} text="Verify email" />
            <EmailDivider />
            <FooterNote>
                If you didn&apos;t create an anon.li account, you can safely ignore this email.
            </FooterNote>
        </EmailLayout>
    );
}
