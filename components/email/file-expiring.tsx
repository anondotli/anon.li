import { EmailLayout } from "./layout";
import { EmailHeader, FileInfoCard, EmailCTA, emailColors } from "./primitives";

interface FileExpiringEmailProps {
    fileName: string;
    fileId: string;
    hoursRemaining: number;
}

export function FileExpiringEmail({ fileName, hoursRemaining }: Omit<FileExpiringEmailProps, 'fileId'> & { fileId?: string }) {
    const timeText = hoursRemaining <= 1 ? "less than an hour" : `${hoursRemaining} hours`;

    return (
        <EmailLayout title="File Expiring Soon" preheader={`Your file will be deleted in ${timeText}`}>
            <EmailHeader
                icon="&#9200;"
                iconBgColor={emailColors.warningBg}
                title="File Expiring Soon"
                subtitle={<>Your file will be permanently deleted in <strong style={{ color: emailColors.warning }}>{timeText}</strong></>}
            />
            <FileInfoCard
                icon="&#128193;"
                title={fileName}
                description="Download or share it before it's gone forever."
            />
            <EmailCTA href="https://anon.li/dashboard/drop" text="View My Drops" />
        </EmailLayout>
    );
}
