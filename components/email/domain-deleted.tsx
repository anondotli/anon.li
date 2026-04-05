import { EmailLayout } from "./layout";
import { EmailHeader, ContentRow, EmailCTA, emailColors } from "./primitives";

interface DomainDeletedEmailProps {
    domain: string;
}

export function DomainDeletedEmail({ domain }: DomainDeletedEmailProps) {
    return (
        <EmailLayout title="Domain Deleted" preheader={`The domain ${domain} has been removed from your account`}>
            <EmailHeader
                icon="&#128465;&#65039;"
                iconBgColor={emailColors.errorBg}
                title="Domain Deleted"
                subtitle={<>The domain <strong style={{ color: emailColors.text }}>{domain}</strong> has been removed from your account.</>}
            />
            <ContentRow>
                <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.7, color: emailColors.textLight, textAlign: "center" }}>
                    This happened because the domain was not verified within 24 hours. You can add it again at any time.
                </p>
            </ContentRow>
            <EmailCTA href="https://anon.li/dashboard/domains" text="Manage Domains" />
        </EmailLayout>
    );
}
