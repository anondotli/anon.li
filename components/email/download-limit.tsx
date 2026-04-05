import { EmailLayout } from "./layout";
import { EmailHeader, FileInfoCard, EmailCTA, emailColors } from "./primitives";

interface DownloadLimitReachedEmailProps {
    fileName: string;
    fileId: string;
    downloads: number;
}

export function DownloadLimitReachedEmail({ fileName, downloads }: Omit<DownloadLimitReachedEmailProps, 'fileId'> & { fileId?: string }) {
    return (
        <EmailLayout title="Download Limit Reached" preheader="Your file reached its download limit and will be deleted">
            <EmailHeader
                icon="&#128465;&#65039;"
                iconBgColor={emailColors.errorBg}
                title="Download Limit Reached"
                subtitle={<>Your file has been downloaded <strong style={{ color: emailColors.error }}>{downloads} times</strong> and is now scheduled for deletion.</>}
            />
            <FileInfoCard
                icon="&#128193;"
                title={fileName}
                description="This file will be permanently deleted shortly."
            />
            <EmailCTA href="https://anon.li/dashboard/drop" text="View My Drops" />
        </EmailLayout>
    );
}
