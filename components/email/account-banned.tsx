import { EmailLayout } from "./layout";
import { EmailHeader, InfoBox, AccentCard, ContentRow, emailColors, emailTextStyles } from "./primitives";

interface AccountBannedEmailProps {
    reason: string;
}

export function AccountBannedEmail({ reason }: AccountBannedEmailProps) {
    return (
        <EmailLayout title="Account Suspended" preheader="Your account has been permanently suspended">
            <EmailHeader
                icon="&#9940;"
                iconBgColor="#331918"
                title="Account Permanently Suspended"
                subtitle="Your anon.li account has been permanently suspended due to repeated Terms of Service violations."
            />
            <InfoBox variant="error">
                <p style={{ margin: 0, fontSize: "14px", fontWeight: 600, color: emailColors.error }}>
                    3 strikes received - Account access has been revoked
                </p>
            </InfoBox>
            <AccentCard label="Final Violation Reason" accentColor="#812b2a">
                {reason}
            </AccentCard>
            <tr>
                <td style={{ padding: "0 48px 24px" }}>
                    <table role="presentation" width="100%" cellSpacing="0" cellPadding="0">
                        <tbody>
                            <tr>
                                <td style={{ padding: "20px", backgroundColor: emailColors.cardBg, borderRadius: "16px" }}>
                                    <p style={{ ...emailTextStyles.label, marginBottom: "12px" }}>
                                        What This Means
                                    </p>
                                    <ul style={{ margin: 0, padding: "0 0 0 20px", fontSize: "14px", lineHeight: 1.8, color: emailColors.textMuted }}>
                                        <li>You can no longer log in to your account</li>
                                        <li>All your files have been removed</li>
                                        <li>All your email aliases have been deactivated</li>
                                        <li>Any active subscriptions have been canceled</li>
                                    </ul>
                                </td>
                            </tr>
                        </tbody>
                    </table>
                </td>
            </tr>
            <ContentRow padding="0 48px 48px">
                <p style={{ margin: "0 0 20px", fontSize: "14px", color: emailColors.textLight, lineHeight: 1.6 }}>
                    If you believe this is a mistake, you may contact our support team at{" "}
                    <a href="mailto:hi@anon.li" style={{ color: "#faf8f5", textDecoration: "underline" }}>hi@anon.li</a>
                </p>
            </ContentRow>
        </EmailLayout>
    );
}
