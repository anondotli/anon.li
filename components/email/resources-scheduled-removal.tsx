import { EmailLayout } from "./layout";
import { EmailHeader, InfoBox, ContentRow, EmailCTA, emailColors } from "./primitives";

interface ResourcesScheduledRemovalEmailProps {
    aliases: { email: string; format: string }[];
    domains: string[];
    recipients: string[];
    deletionDate: string;
}

function ResourceSection({ title, items }: { title: string; items: string[] }) {
    if (items.length === 0) return null;
    return (
        <>
            <p style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600, color: emailColors.text }}>
                {title}
            </p>
            <table role="presentation" cellSpacing="0" cellPadding="0" style={{ width: "100%", marginBottom: "16px" }}>
                <tbody>
                    {items.map((item, i) => (
                        <tr key={i}>
                            <td style={{
                                fontSize: "14px",
                                lineHeight: 1.8,
                                color: emailColors.textMuted,
                                paddingLeft: "12px",
                            }}>
                                &bull; {item}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </>
    );
}

export function ResourcesScheduledRemovalEmail({
    aliases,
    domains,
    recipients,
    deletionDate,
}: ResourcesScheduledRemovalEmailProps) {
    return (
        <EmailLayout title="Resources Scheduled for Removal" preheader="Some of your resources are scheduled for deletion">
            <EmailHeader
                icon="&#128197;"
                iconBgColor={emailColors.warningBg}
                title="Resources Scheduled for Removal"
            />
            <ContentRow padding="0 48px 24px">
                <p style={{ margin: "0 0 16px", fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    The following resources have been selected for removal because your account
                    exceeds the free tier limits. They will be permanently deleted on{" "}
                    <strong style={{ color: emailColors.warning }}>{deletionDate}</strong>.
                </p>
            </ContentRow>
            <InfoBox variant="warning" withBorder>
                <ResourceSection
                    title="Aliases"
                    items={aliases.map((a) => `${a.email} (${a.format.toLowerCase()})`)}
                />
                <ResourceSection title="Domains" items={domains} />
                <ResourceSection title="Recipients" items={recipients} />
            </InfoBox>
            <ContentRow padding="0 48px 16px">
                <table role="presentation" cellSpacing="0" cellPadding="0" style={{ width: "100%" }}>
                    <tbody>
                        <tr>
                            <td align="center" style={{ paddingBottom: "12px" }}>
                                <EmailCTA href="https://anon.li/dashboard/billing" text="Upgrade Plan" />
                            </td>
                        </tr>
                        <tr>
                            <td align="center">
                                <a
                                    href="https://anon.li/dashboard"
                                    style={{
                                        fontSize: "14px",
                                        color: emailColors.textMuted,
                                        textDecoration: "underline",
                                    }}
                                >
                                    Manage Account
                                </a>
                            </td>
                        </tr>
                    </tbody>
                </table>
            </ContentRow>
        </EmailLayout>
    );
}
