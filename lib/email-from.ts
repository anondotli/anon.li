import "server-only"

/**
 * Sender address for outgoing email. Production sends from anon.li; local and
 * self-hosted setups can point EMAIL_FROM_DOMAIN at a domain verified in their
 * own Resend account (Resend rejects unverified sender domains).
 */
export function emailFrom(mailbox: "hi" | "billing" = "hi"): string {
    const domain = process.env.EMAIL_FROM_DOMAIN?.trim() || "anon.li"
    return `anon.li <${mailbox}@${domain}>`
}
