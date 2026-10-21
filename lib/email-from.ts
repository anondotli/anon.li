import "server-only"

type Mailbox = "hi" | "billing"

/**
 * Bare address of an anon.li mailbox on the sender domain, e.g. hi@anon.li.
 * Production uses anon.li; local and self-hosted setups can point
 * EMAIL_FROM_DOMAIN at a domain verified in their own Resend account (Resend
 * rejects unverified sender domains).
 */
export function mailboxAddress(mailbox: Mailbox = "hi"): string {
    const domain = process.env.EMAIL_FROM_DOMAIN?.trim() || "anon.li"
    return `${mailbox}@${domain}`
}

/** Sender address for outgoing email. */
export function emailFrom(mailbox: Mailbox = "hi"): string {
    return `anon.li <${mailboxAddress(mailbox)}>`
}
