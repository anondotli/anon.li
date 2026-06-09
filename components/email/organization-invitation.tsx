import { EmailLayout } from "./layout";
import { EmailSimpleHeader, EmailCTA, EmailDivider, FooterNote } from "./primitives";

interface OrganizationInvitationEmailProps {
    url: string;
    organizationName: string;
    inviterName: string;
}

export function OrganizationInvitationEmail({ url, organizationName, inviterName }: OrganizationInvitationEmailProps) {
    return (
        <EmailLayout
            title={`Join ${organizationName} on anon.li`}
            preheader={`${inviterName} invited you to join ${organizationName} on anon.li`}
        >
            <EmailSimpleHeader
                title={`You've been invited to ${organizationName}`}
                subtitle={`${inviterName} invited you to join their team on anon.li, where you can share aliases, custom domains, and encrypted files.`}
            />
            <EmailCTA href={url} text="Accept invitation" />
            <EmailDivider />
            <FooterNote>
                If you weren&apos;t expecting this invitation, you can safely ignore this email.
            </FooterNote>
        </EmailLayout>
    );
}
