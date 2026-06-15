import { EmailLayout } from "./layout";
import { EmailHeader, StatBox, EmailCTA, emailColors } from "./primitives";

interface FileDownloadedEmailProps {
    downloadCount: number;
    downloadTime: string;
}

export function FileDownloadedEmail({ downloadCount, downloadTime }: FileDownloadedEmailProps) {
    return (
        <EmailLayout title="Your Drop Was Downloaded" preheader="Someone just downloaded your drop">
            <EmailHeader
                icon="&#128229;"
                iconBgColor={emailColors.successBg}
                title="Drop Downloaded"
                subtitle={`Someone downloaded your drop on ${downloadTime}.`}
            />
            <StatBox
                value={downloadCount}
                label="total downloads"
                color={emailColors.success}
                bgColor={emailColors.successBg}
            />
            <EmailCTA href="https://anon.li/dashboard/drop" text="View My Drops" />
        </EmailLayout>
    );
}
