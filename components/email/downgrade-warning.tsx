import { EmailLayout } from "./layout";
import { EmailHeader, InfoBox, ContentRow, EmailCTA, emailColors } from "./primitives";

interface DowngradeWarningEmailProps {
    excessRandom: number;
    excessCustom: number;
    excessDomains: number;
    excessRecipients: number;
    schedulingDate: string;
    deletionDate: string;
}

export function DowngradeWarningEmail({
    excessRandom,
    excessCustom,
    excessDomains,
    excessRecipients,
    schedulingDate,
    deletionDate,
}: DowngradeWarningEmailProps) {
    const items: string[] = [];
    if (excessRandom > 0) items.push(`${excessRandom} random alias${excessRandom !== 1 ? "es" : ""}`);
    if (excessCustom > 0) items.push(`${excessCustom} custom alias${excessCustom !== 1 ? "es" : ""}`);
    if (excessDomains > 0) items.push(`${excessDomains} custom domain${excessDomains !== 1 ? "s" : ""}`);
    if (excessRecipients > 0) items.push(`${excessRecipients} recipient${excessRecipients !== 1 ? "s" : ""}`);

    return (
        <EmailLayout title="Account Downgraded" preheader="Your account exceeds free tier limits - resources will be removed">
            <EmailHeader
                icon="&#9888;&#65039;"
                iconBgColor={emailColors.warningBg}
                title="Account Downgraded"
            />
            <ContentRow padding="0 48px 24px">
                <p style={{ margin: "0 0 16px", fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    Your subscription has ended and your account has been downgraded to the free tier.
                    You currently have resources that exceed the free plan limits.
                </p>
            </ContentRow>
            <InfoBox variant="warning" withBorder>
                <p style={{ margin: "0 0 12px", fontSize: "14px", fontWeight: 600, color: emailColors.warning }}>
                    Free tier limits exceeded:
                </p>
                <table role="presentation" cellSpacing="0" cellPadding="0" style={{ width: "100%" }}>
                    <tbody>
                        <tr>
                            <td style={{ fontSize: "14px", lineHeight: 1.8, color: emailColors.textMuted, paddingLeft: "12px" }}>
                                {items.map((item, i) => (
                                    <span key={i}>&bull; {item}<br /></span>
                                ))}
                            </td>
                        </tr>
                    </tbody>
                </table>
            </InfoBox>
            <ContentRow padding="0 48px 24px">
                <p style={{ margin: "0 0 16px", fontSize: "15px", lineHeight: 1.7, color: emailColors.textMuted, textAlign: "center" }}>
                    On <strong style={{ color: emailColors.text }}>{schedulingDate}</strong>, excess resources
                    will be selected for removal. They will be permanently deleted on{" "}
                    <strong style={{ color: emailColors.text }}>{deletionDate}</strong> unless you renew your subscription.
                </p>
            </ContentRow>
            <EmailCTA href="https://anon.li/dashboard/billing" text="Renew Subscription" />
            <ContentRow padding="24px 48px 0">
                <p style={{ margin: 0, fontSize: "13px", lineHeight: 1.6, color: emailColors.textLighter, textAlign: "center" }}>
                    You can also manually remove resources to stay within free tier limits.
                </p>
            </ContentRow>
        </EmailLayout>
    );
}
