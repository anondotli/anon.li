import { EmailLayout } from "./layout";
import { EmailHeader, InfoBox, ContentRow, EmailCTA, emailColors } from "./primitives";

interface ResourcesDeletedEmailProps {
    aliasesDeleted: number;
    domainsDeleted: number;
    recipientsDeleted: number;
    sparedCount: number;
}

export function ResourcesDeletedEmail({
    aliasesDeleted,
    domainsDeleted,
    recipientsDeleted,
    sparedCount,
}: ResourcesDeletedEmailProps) {
    const items: string[] = [];
    if (aliasesDeleted > 0) items.push(`${aliasesDeleted} alias${aliasesDeleted !== 1 ? "es" : ""} deleted`);
    if (domainsDeleted > 0) items.push(`${domainsDeleted} domain${domainsDeleted !== 1 ? "s" : ""} deleted`);
    if (recipientsDeleted > 0) items.push(`${recipientsDeleted} recipient${recipientsDeleted !== 1 ? "s" : ""} deleted`);

    return (
        <EmailLayout title="Resources Removed" preheader="Resources exceeding free tier limits have been removed">
            <EmailHeader
                icon="&#128465;&#65039;"
                iconBgColor={emailColors.errorBg}
                title="Resources Removed"
            />
            <ContentRow padding="0 48px 24px">
                <p style={{ margin: "0 0 16px", fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    The following resources have been permanently removed from your account
                    to bring it within free tier limits.
                </p>
            </ContentRow>
            <InfoBox variant="warning" withBorder>
                <table role="presentation" cellSpacing="0" cellPadding="0" style={{ width: "100%" }}>
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
            </InfoBox>
            {sparedCount > 0 && (
                <ContentRow padding="0 48px 24px">
                    <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                        {sparedCount} resource{sparedCount !== 1 ? "s were" : " was"} spared because
                        your account is within limits for those resource types.
                    </p>
                </ContentRow>
            )}
            <ContentRow padding="0 48px 8px">
                <p style={{ margin: 0, fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Upgrade your plan to restore access to higher limits and premium features.
                </p>
            </ContentRow>
            <EmailCTA href="https://anon.li/dashboard/billing" text="Upgrade Plan" />
        </EmailLayout>
    );
}
