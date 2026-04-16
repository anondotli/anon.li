import { EmailLayout } from "./layout";
import {
    EmailCTA,
    EmailDivider,
    EmailHeader,
    FooterNote,
    InfoBox,
    emailColors,
} from "./primitives";

interface PasswordResetEmailProps {
    url: string;
}

export function PasswordResetEmail({ url }: PasswordResetEmailProps) {
    return (
        <EmailLayout
            title="Reset your anon.li password"
            preheader="Use this secure link to reset your password and rebuild your encrypted vault"
        >
            <EmailHeader
                icon="&#9888;&#65039;"
                iconBgColor={emailColors.warningBg}
                title="Reset your password"
                subtitle="Use the button below to choose a new password for your account."
            />
            <InfoBox variant="warning" withBorder>
                <p style={{ margin: "0 0 8px", fontSize: "14px", fontWeight: 600, color: emailColors.warning }}>
                    Your encrypted vault will be destroyed
                </p>
                <p style={{ margin: 0, fontSize: "14px", lineHeight: 1.7, color: emailColors.textMuted }}>
                    Resetting your password makes previously encrypted vault data permanently inaccessible.
                    After signing back in, you will need to create a new vault.
                </p>
            </InfoBox>
            <EmailCTA href={url} text="Reset password" />
            <EmailDivider />
            <FooterNote>
                If you didn&apos;t request this password reset, you can safely ignore this email.
            </FooterNote>
        </EmailLayout>
    );
}
