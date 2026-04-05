import { EmailLayout } from "./layout";
import { EmailHeader, ContentRow, emailColors } from "./primitives";

interface ReportConfirmationEmailProps {
    trackingToken: string;
}

export function ReportConfirmationEmail({ trackingToken }: ReportConfirmationEmailProps) {
    return (
        <EmailLayout title="Report Received" preheader="We've received your abuse report and will review it shortly">
            <EmailHeader
                icon="&#10003;"
                iconBgColor={emailColors.successBg}
                title="Report Received"
                subtitle="Thank you for helping keep anon.li safe. We've received your report."
            />
            <ContentRow padding="0 48px 48px">
                <p style={{ margin: "0 0 16px", fontSize: "14px", color: emailColors.textLight, lineHeight: 1.6 }}>
                    Our team will review your report and take appropriate action. You can check the status
                    of your report at any time using your tracking token:
                </p>
                <table role="presentation" width="100%" cellSpacing="0" cellPadding="0">
                    <tbody>
                        <tr>
                            <td style={{
                                padding: "12px 16px",
                                backgroundColor: emailColors.cardBg,
                                border: `1px solid ${emailColors.border}`,
                                borderRadius: "8px",
                                fontFamily: "monospace",
                                fontSize: "14px",
                                color: emailColors.text,
                                textAlign: "center" as const,
                                letterSpacing: "1px",
                            }}>
                                {trackingToken}
                            </td>
                        </tr>
                    </tbody>
                </table>
                <p style={{ margin: "16px 0 0", fontSize: "13px", color: emailColors.textLighter, lineHeight: 1.6 }}>
                    We&apos;ll notify you when the status of your report changes.
                </p>
            </ContentRow>
        </EmailLayout>
    );
}
