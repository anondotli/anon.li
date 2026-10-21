import { EmailLayout } from "./layout";
import { emailUrl } from "./styles";
import { EmailHeader, ContentRow, EmailCTA, emailColors } from "./primitives";

interface AbuseReportNotificationEmailProps {
    serviceType: string;
    /** Display-safe (already sanitized) resource identifier. */
    resourceId: string;
    /** Raw resource identifier, used only URL-encoded in the admin link. */
    searchId: string;
    reason: string;
    priority: string;
}

export function AbuseReportNotificationEmail({
    serviceType,
    resourceId,
    searchId,
    reason,
    priority,
}: AbuseReportNotificationEmailProps) {
    const isUrgent = priority === "urgent" || priority === "high";
    const rows: Array<[string, string]> = [
        ["Service", serviceType],
        ["Resource", resourceId],
        ["Reason", reason],
        ["Priority", priority],
    ];
    const reviewUrl = emailUrl(
        `/admin/reports?type=${encodeURIComponent(serviceType)}&search=${encodeURIComponent(searchId)}`,
    );

    return (
        <EmailLayout title="New Abuse Report" preheader={`New ${priority} priority ${serviceType} report: ${reason}`}>
            <EmailHeader
                icon="&#9888;&#65039;"
                iconBgColor={isUrgent ? emailColors.errorBg : emailColors.warningBg}
                title="New Abuse Report"
                subtitle="A report was submitted and is waiting for review."
            />
            <ContentRow>
                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0" style={{
                    backgroundColor: emailColors.cardBg,
                    border: `1px solid ${emailColors.border}`,
                    borderRadius: "8px",
                }}>
                    <tbody>
                        {rows.map(([label, value]) => (
                            <tr key={label}>
                                <td style={{ padding: "10px 16px", fontSize: "13px", color: emailColors.textLighter, width: "35%" }}>
                                    {label}
                                </td>
                                <td style={{ padding: "10px 16px", fontSize: "14px", color: emailColors.text, fontFamily: "monospace", wordBreak: "break-all" as const }}>
                                    {value}
                                </td>
                            </tr>
                        ))}
                    </tbody>
                </table>
                <p style={{ margin: "16px 0 0", fontSize: "13px", color: emailColors.textLighter, lineHeight: 1.6 }}>
                    The description and reporter details are only available in the admin panel.
                </p>
            </ContentRow>
            <EmailCTA href={reviewUrl} text="Review Report" />
        </EmailLayout>
    );
}
