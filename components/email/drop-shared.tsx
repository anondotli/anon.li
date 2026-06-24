import { EmailLayout } from "./layout";
import { EmailSimpleHeader, EmailCTA, EmailDivider, FooterNote } from "./primitives";

interface DropSharedEmailProps {
    url: string;
    senderName: string;
    passwordProtected: boolean;
}

/**
 * Sent to a named drop recipient. The `url` is KEYLESS (`/d/{id}?r={token}`) — it
 * carries only the access token, never the decryption key. The recipient still
 * needs the key/password the sender shares separately, so anon.li never sees it.
 */
export function DropSharedEmail({ url, senderName, passwordProtected }: DropSharedEmailProps) {
    return (
        <EmailLayout
            title="Encrypted files shared with you"
            preheader={`${senderName} shared encrypted files with you on anon.li`}
        >
            <EmailSimpleHeader
                title="Someone shared encrypted files with you"
                subtitle={`${senderName} shared end-to-end encrypted files with you via anon.li Drop. This link is unique to you and can be revoked at any time.`}
            />
            <EmailCTA href={url} text="Open files" />
            <EmailDivider />
            <FooterNote>
                {passwordProtected
                    ? "You'll need the password the sender shared with you to decrypt these files. anon.li never sees the password or the file contents."
                    : "You'll need the decryption key the sender shared with you to open these files. anon.li never sees the key or the file contents."}
            </FooterNote>
        </EmailLayout>
    );
}
