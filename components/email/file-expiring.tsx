import { EmailLayout } from "./layout";
import { EmailHeader, EmailCTA, emailColors } from "./primitives";

interface FileExpiringEmailProps {
    hoursRemaining: number;
}

export function FileExpiringEmail({ hoursRemaining }: FileExpiringEmailProps) {
    const timeText = hoursRemaining <= 1 ? "less than an hour" : `${hoursRemaining} hours`;

    return (
        <EmailLayout title="Drop Expiring Soon" preheader={`Your drop will be deleted in ${timeText}`}>
            <EmailHeader
                icon="&#9200;"
                iconBgColor={emailColors.warningBg}
                title="Drop Expiring Soon"
                subtitle={<>Your drop will be permanently deleted in <strong style={{ color: emailColors.warning }}>{timeText}</strong></>}
            />
            <EmailCTA href="https://anon.li/dashboard/drop" text="View My Drops" />
        </EmailLayout>
    );
}
