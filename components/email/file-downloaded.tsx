import { EmailLayout } from "./layout";
import { EmailHeader, FileInfoCard, StatBox, EmailCTA, emailColors } from "./primitives";

interface FileDownloadedEmailProps {
    fileName: string;
    downloadCount: number;
    downloadTime: string;
}

export function FileDownloadedEmail({ fileName, downloadCount, downloadTime }: FileDownloadedEmailProps) {
    return (
        <EmailLayout title="Your File Was Downloaded" preheader="Someone just downloaded your file">
            <EmailHeader
                icon="&#128229;"
                iconBgColor={emailColors.successBg}
                title="File Downloaded"
                subtitle="Someone just downloaded your file."
            />
            <FileInfoCard
                icon="&#128193;"
                title={fileName}
                description={`Downloaded at ${downloadTime}`}
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
