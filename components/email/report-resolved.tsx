import { EmailLayout } from "./layout";
import { EmailHeader, ContentRow, emailColors } from "./primitives";

interface ReportResolvedEmailProps {
    status: string;
}

export function ReportResolvedEmail({ status }: ReportResolvedEmailProps) {
    const statusLabel = status === "resolved" ? "resolved" : status === "dismissed" ? "reviewed and dismissed" : "updated";

    return (
        <EmailLayout title="Report Update" preheader={`Your abuse report has been ${statusLabel}`}>
            <EmailHeader
                icon="&#128203;"
                iconBgColor={emailColors.successBg}
                title="Report Update"
                subtitle={`Your abuse report has been ${statusLabel}.`}
            />
            <ContentRow padding="0 48px 48px">
                <p style={{ margin: "0 0 16px", fontSize: "14px", color: emailColors.textLight, lineHeight: 1.6 }}>
                    {status === "resolved"
                        ? "We have reviewed your report and taken appropriate action. Thank you for helping keep anon.li safe."
                        : status === "dismissed"
                            ? "After careful review, we determined that the reported content does not violate our policies. No action was taken."
                            : "Your report status has been updated by our team."}
                </p>
                <p style={{ margin: "0", fontSize: "13px", color: emailColors.textLighter, lineHeight: 1.6 }}>
                    If you have additional concerns, you can submit a new report through our website.
                </p>
            </ContentRow>
        </EmailLayout>
    );
}
