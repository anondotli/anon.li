import { EmailLayout } from "./layout";
import { EmailHeader, ContentRow, EmailCTA, emailColors } from "./primitives";

interface DomainUnverifiedEmailProps {
    domain: string;
}

export function DomainUnverifiedEmail({ domain }: DomainUnverifiedEmailProps) {
    return (
        <EmailLayout title="Action Required: Domain Unverified" preheader={`Verify your domain ${domain} to keep it active`}>
            <EmailHeader
                icon="&#9888;&#65039;"
                iconBgColor={emailColors.warningBg}
                title="Action Required"
                subtitle={<>We could not verify ownership of the domain <strong style={{ color: emailColors.warning }}>{domain}</strong>.</>}
            />
            <ContentRow padding="0 48px 32px">
                <p style={{ margin: "0 0 24px", fontSize: "14px", lineHeight: 1.7, color: emailColors.textLight, textAlign: "center" }}>
                    Please ensure your DNS records are configured correctly. If verification fails repeatedly, the domain will be removed from your account to prevent abuse.
                </p>
            </ContentRow>
            <EmailCTA href="https://anon.li/dashboard/domains" text="Verify Domain" />
        </EmailLayout>
    );
}
