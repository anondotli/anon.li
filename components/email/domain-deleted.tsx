import { EmailLayout } from "./layout";
import { emailUrl } from "./styles";
import { EmailHeader, ContentRow, EmailCTA, emailColors } from "./primitives";
import { REVOKED_DOMAIN_GRACE_DAYS } from "@/lib/constants";

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
                    This happened because the domain was not verified within 24 hours of being added, or because it lost
                    verification and wasn&apos;t verified again within {REVOKED_DOMAIN_GRACE_DAYS} days. Any aliases on this
                    domain were removed with it. You can add the domain again at any time.
                </p>
            </ContentRow>
            <EmailCTA href={emailUrl("/dashboard/domains")} text="Manage Domains" />
        </EmailLayout>
    );
}
