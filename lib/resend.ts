import React from "react"
import { Resend } from "resend"
import { sanitizeEmailSubject, sanitizeDomain, sanitizeFilename } from "@/lib/utils"
import { createLogger } from "@/lib/logger"

const logger = createLogger("Resend")

// Lazy initialization to avoid build errors when API key is not set
let resendClient: Resend | null = null

function getResendClient(): Resend {
    if (!resendClient) {
        const apiKey = process.env.AUTH_RESEND_KEY
        if (!apiKey) {
            throw new Error("AUTH_RESEND_KEY environment variable is not set")
        }
        resendClient = new Resend(apiKey)
    }
    return resendClient
}

export async function sendWelcomeEmail(email: string) {
    try {
        const resend = getResendClient()
        const { WelcomeEmail } = await import("@/components/email/welcome")

        const { data, error } = await resend.emails.send({
            from: "anon.li <hi@anon.li>",
            to: email,
            subject: "Welcome to anon.li - Your Privacy Journey Starts Now",
            react: React.createElement(WelcomeEmail),
        })

        if (error) {
            logger.error("Failed to send welcome email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send welcome email", error)
        return { success: false, error }
    }
}

export async function sendSubscriptionCanceledEmail(email: string, expiryDate: Date) {
    try {
        const resend = getResendClient()
        const { SubscriptionCanceledEmail } = await import("@/components/email/subscription-canceled")
        const formattedDate = expiryDate.toLocaleDateString('en-US', {
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        })

        const { data, error } = await resend.emails.send({
            from: "anon.li <billing@anon.li>",
            to: email,
            subject: "Your anon.li subscription has ended",
            react: React.createElement(SubscriptionCanceledEmail, { expiryDate: formattedDate }),
        })

        if (error) {
            logger.error("Failed to send subscription canceled email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send subscription canceled email", error)
        return { success: false, error }
    }
}

export async function sendPaymentActionRequiredEmail(email: string, paymentUrl: string) {
    try {
        const resend = getResendClient()

        const { data, error } = await resend.emails.send({
            from: "anon.li <billing@anon.li>",
            to: email,
            subject: "Action Required: Complete your anon.li payment",
            text: `Your recent payment requires additional authentication.\n\nPlease complete your payment by visiting:\n${paymentUrl}\n\nThis is required to continue your anon.li subscription.\n\nIf you didn't make this purchase, please ignore this email.`,
        })

        if (error) {
            logger.error("Failed to send payment action required email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send payment action required email", error)
        return { success: false, error }
    }
}

export async function sendDropExpiringEmail(email: string, dropName: string, dropId: string, hoursRemaining: number) {
    try {
        const resend = getResendClient()
        const { FileExpiringEmail } = await import("@/components/email/file-expiring")
        const safeName = sanitizeFilename(dropName, 50)

        const { data, error } = await resend.emails.send({
            from: "anon.li <files@anon.li>",
            to: email,
            subject: sanitizeEmailSubject(`Your drop "${safeName}" expires soon`),
            react: React.createElement(FileExpiringEmail, { fileName: safeName, fileId: dropId, hoursRemaining }),
        })

        if (error) {
            logger.error("Failed to send drop expiring email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send drop expiring email", error)
        return { success: false, error }
    }
}

export async function sendDownloadLimitReachedEmail(email: string, fileName: string, fileId: string, downloads: number) {
    try {
        const resend = getResendClient()
        const { DownloadLimitReachedEmail } = await import("@/components/email/download-limit")
        const safeName = sanitizeFilename(fileName, 50)

        const { data, error } = await resend.emails.send({
            from: "anon.li <files@anon.li>",
            to: email,
            subject: sanitizeEmailSubject(`Download limit reached for "${safeName}"`),
            react: React.createElement(DownloadLimitReachedEmail, { fileName: safeName, fileId, downloads }),
        })

        if (error) {
            logger.error("Failed to send download limit reached email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send download limit reached email", error)
        return { success: false, error }
    }
}

export async function sendDomainDeletedEmail(email: string, domain: string) {
    try {
        const resend = getResendClient()
        const { DomainDeletedEmail } = await import("@/components/email/domain-deleted")
        const safeDomain = sanitizeDomain(domain)

        const { data, error } = await resend.emails.send({
            from: "anon.li <domains@anon.li>",
            to: email,
            subject: sanitizeEmailSubject(`Domain "${safeDomain}" has been deleted`),
            react: React.createElement(DomainDeletedEmail, { domain: safeDomain }),
        })

        if (error) {
            logger.error("Failed to send domain deleted email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send domain deleted email", error)
        return { success: false, error }
    }
}

export async function sendDomainUnverifiedEmail(email: string, domain: string) {
    try {
        const resend = getResendClient()
        const { DomainUnverifiedEmail } = await import("@/components/email/domain-unverified")
        const safeDomain = sanitizeDomain(domain)

        const { data, error } = await resend.emails.send({
            from: "anon.li <domains@anon.li>",
            to: email,
            subject: sanitizeEmailSubject(`Action Required: Verification lost for "${safeDomain}"`),
            react: React.createElement(DomainUnverifiedEmail, { domain: safeDomain }),
        })

        if (error) {
            logger.error("Failed to send domain unverified email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send domain unverified email", error)
        return { success: false, error }
    }
}

export async function sendMagicLinkEmail(email: string, url: string, host: string) {
    try {
        const resend = getResendClient()
        const { MagicLinkEmail } = await import("@/components/email/magic-link")

        const { data, error } = await resend.emails.send({
            from: "anon.li <hi@anon.li>",
            to: email,
            subject: `Sign in to ${host}`,
            text: `Sign in to ${host}\n${url}\n\n`,
            react: React.createElement(MagicLinkEmail, { url, host }),
        })

        if (error) {
            logger.error("Failed to send magic link email", error)
            throw error
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send magic link email", error)
        throw error
    }
}

interface SendEmailProps {
    to: string;
    subject: string;
    react: React.ReactElement;
    from?: string;
}

export async function sendEmail({ to, subject, react, from = "anon.li <files@anon.li>" }: SendEmailProps) {
    try {
        const resend = getResendClient()

        const { data, error } = await resend.emails.send({
            from,
            to,
            subject,
            react,
        })

        if (error) {
            logger.error("Failed to send email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send email", error)
        return { success: false, error }
    }
}

export async function sendRecipientVerificationEmail(email: string, token: string) {
    try {
        const resend = getResendClient()
        const { RecipientVerificationEmail } = await import("@/components/email/recipient-verification")
        const verificationUrl = `${process.env.NEXT_PUBLIC_APP_URL}/verify-recipient?token=${token}`

        const { data, error } = await resend.emails.send({
            from: "anon.li <hi@anon.li>",
            to: email,
            subject: "Verify your email address - anon.li",
            react: React.createElement(RecipientVerificationEmail, { verificationUrl, recipientEmail: email }),
        })

        if (error) {
            logger.error("Failed to send recipient verification email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send recipient verification email", error)
        return { success: false, error }
    }
}

export async function sendDowngradeWarningEmail(
    email: string,
    excess: { excessRandom: number; excessCustom: number; excessDomains: number; excessRecipients: number },
    schedulingDate: Date,
    deletionDate: Date,
) {
    try {
        const resend = getResendClient()
        const { DowngradeWarningEmail } = await import("@/components/email/downgrade-warning")
        const formatDate = (d: Date) => d.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

        const { data, error } = await resend.emails.send({
            from: "anon.li <billing@anon.li>",
            to: email,
            subject: "Your anon.li account has been downgraded",
            react: React.createElement(DowngradeWarningEmail, {
                excessRandom: excess.excessRandom,
                excessCustom: excess.excessCustom,
                excessDomains: excess.excessDomains,
                excessRecipients: excess.excessRecipients,
                schedulingDate: formatDate(schedulingDate),
                deletionDate: formatDate(deletionDate),
            }),
        })

        if (error) {
            logger.error("Failed to send downgrade warning email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send downgrade warning email", error)
        return { success: false, error }
    }
}

export async function sendResourcesScheduledForRemovalEmail(
    email: string,
    resources: { aliases: { email: string; format: string }[]; domains: string[]; recipients: string[] },
    deletionDate: Date,
) {
    try {
        const resend = getResendClient()
        const { ResourcesScheduledRemovalEmail } = await import("@/components/email/resources-scheduled-removal")
        const formattedDate = deletionDate.toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })

        const { data, error } = await resend.emails.send({
            from: "anon.li <billing@anon.li>",
            to: email,
            subject: "anon.li: Resources scheduled for removal",
            react: React.createElement(ResourcesScheduledRemovalEmail, {
                aliases: resources.aliases,
                domains: resources.domains,
                recipients: resources.recipients,
                deletionDate: formattedDate,
            }),
        })

        if (error) {
            logger.error("Failed to send resources scheduled email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send resources scheduled email", error)
        return { success: false, error }
    }
}

export async function sendResourcesDeletedEmail(
    email: string,
    counts: { aliasesDeleted: number; domainsDeleted: number; recipientsDeleted: number; sparedCount: number },
) {
    try {
        const resend = getResendClient()
        const { ResourcesDeletedEmail } = await import("@/components/email/resources-deleted")

        const { data, error } = await resend.emails.send({
            from: "anon.li <billing@anon.li>",
            to: email,
            subject: "anon.li: Resources have been removed",
            react: React.createElement(ResourcesDeletedEmail, {
                aliasesDeleted: counts.aliasesDeleted,
                domainsDeleted: counts.domainsDeleted,
                recipientsDeleted: counts.recipientsDeleted,
                sparedCount: counts.sparedCount,
            }),
        })

        if (error) {
            logger.error("Failed to send resources deleted email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send resources deleted email", error)
        return { success: false, error }
    }
}

export async function sendCryptoPaymentConfirmationEmail(
    email: string,
    details: { product: string; tier: string; periodEnd: Date }
) {
    try {
        const resend = getResendClient()
        const { CryptoPaymentConfirmationEmail } = await import("@/components/email/crypto-payment-confirmation")
        const formattedDate = details.periodEnd.toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
        })

        const { data, error } = await resend.emails.send({
            from: "anon.li <billing@anon.li>",
            to: email,
            subject: "Your anon.li crypto payment has been confirmed",
            react: React.createElement(CryptoPaymentConfirmationEmail, {
                product: details.product,
                tier: details.tier,
                periodEnd: formattedDate,
            }),
        })

        if (error) {
            logger.error("Failed to send crypto payment confirmation email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send crypto payment confirmation email", error)
        return { success: false, error }
    }
}

export async function sendCryptoRenewalReminderEmail(
    email: string,
    details: { daysRemaining: number; product: string; tier: string }
) {
    try {
        const resend = getResendClient()
        const { CryptoRenewalReminderEmail } = await import("@/components/email/crypto-renewal-reminder")

        const { data, error } = await resend.emails.send({
            from: "anon.li <billing@anon.li>",
            to: email,
            subject: `Your anon.li plan expires in ${details.daysRemaining} days`,
            react: React.createElement(CryptoRenewalReminderEmail, {
                daysRemaining: details.daysRemaining,
                product: details.product,
                tier: details.tier,
            }),
        })

        if (error) {
            logger.error("Failed to send crypto renewal reminder email", error)
            return { success: false, error }
        }

        return { success: true, data }
    } catch (error) {
        logger.error("Failed to send crypto renewal reminder email", error)
        return { success: false, error }
    }
}
