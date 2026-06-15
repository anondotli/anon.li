import { EmailLayout } from "./layout";
import { EmailHeader, EmailCTA, emailColors } from "./primitives";

interface DownloadLimitReachedEmailProps {
    downloads: number;
}

export function DownloadLimitReachedEmail({ downloads }: DownloadLimitReachedEmailProps) {
    return (
        <EmailLayout title="Download Limit Reached" preheader="Your drop reached its download limit and will be deleted">
            <EmailHeader
                icon="&#128465;&#65039;"
                iconBgColor={emailColors.errorBg}
                title="Download Limit Reached"
                subtitle={<>Your drop has been downloaded <strong style={{ color: emailColors.error }}>{downloads} times</strong> and is now scheduled for permanent deletion.</>}
            />
            <EmailCTA href="https://anon.li/dashboard/drop" text="View My Drops" />
        </EmailLayout>
    );
}
