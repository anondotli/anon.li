import { formatBytes } from "@/lib/utils";

export interface DropShareOptions {
    shareUrl: string;
    title?: string;
    message?: string;
    fileCount: number;
    totalSize: number;
    expiresAt?: Date;
}

/**
 * Generate mailto link for email sharing
 */
export function generateMailtoLink(options: DropShareOptions): string {
    const subject = options.title
        ? `${options.title} - Secure File Drop`
        : 'Secure File Drop from anon.li';

    const fileInfo = options.fileCount === 1
        ? '1 file'
        : `${options.fileCount} files`;

    const sizeFormatted = formatBytesForShare(options.totalSize);

    let body = options.message
        ? `${options.message}\n\n`
        : '';

    body += `I'm sharing ${fileInfo} (${sizeFormatted}) with you securely via anon.li Drop.\n\n`;
    body += `Download link: ${options.shareUrl}\n\n`;

    if (options.expiresAt) {
        const expiryDate = options.expiresAt.toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        });
        body += `⚠️ This link expires on ${expiryDate}\n\n`;
    }

    body += `---\n`;
    body += `Sent via anon.li Drop - Private, E2E encrypted file sharing\n`;
    body += `Your files are encrypted and we never see your data.`;

    return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// Use formatBytes from utils with 1 decimal place for share messages
function formatBytesForShare(bytes: number): string {
    return formatBytes(bytes, 1);
}