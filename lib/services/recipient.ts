import { z } from "zod"
import { randomBytes } from "crypto"
import * as openpgp from "openpgp"
import { getRecipientLimit, assertOrgPlanActive } from "@/lib/limits"
import { getOrgLimitContext } from "@/lib/data/auth"
import {
    getRecipientsWithAliasCount,
    getVerifiedRecipients as dbGetVerifiedRecipients,
    getRecipientById,
    getRecipientByIdWithAliasCount,
    getRecipientByScopeAndEmail,
    getRecipientByVerificationToken,
    getDefaultRecipient,
    updateRecipient,
    setDefaultRecipient,
    deleteRecipientById,
    verifyRecipient,
    updateRecipientPgpKey,
    createDefaultRecipientForUser,
} from "@/lib/data/recipient"
import { prisma } from "@/lib/prisma"
import { Prisma } from "@prisma/client"
import { getUserById } from "@/lib/data/user"
import { sendRecipientVerificationEmail } from "@/lib/resend"
import { createLogger } from "@/lib/logger"
import { NotFoundError, ValidationError, ConflictError } from "@/lib/api-error-utils"
import { ownerWhere, personalScope, assertCanManage, type OwnerScope } from "@/lib/ownership"

const logger = createLogger("RecipientService")

const emailSchema = z.string().email("Invalid email address").max(254, "Email too long")

const pgpKeySchema = z.object({
    publicKey: z.string()
        .min(1, "Public key is required")
        .includes("BEGIN PGP PUBLIC KEY BLOCK", { message: "Invalid PGP Key format" }),
    name: z.string().max(100, "Key name too long").optional(),
})

export class RecipientService {

    /**
     * Get all recipients within a scope with alias counts.
     */
    static async getRecipients(scope: OwnerScope) {
        return await getRecipientsWithAliasCount(scope)
    }

    /**
     * Get only verified recipients (for alias creation dropdown).
     */
    static async getVerifiedRecipients(scope: OwnerScope) {
        return await dbGetVerifiedRecipients(scope)
    }

    /**
     * Get recipient by ID with permission check.
     */
    static async getRecipient(scope: OwnerScope, recipientId: string) {
        const recipient = await getRecipientByIdWithAliasCount(recipientId, scope)
        if (!recipient) {
            throw new NotFoundError("Recipient not found")
        }
        return recipient
    }

    /**
     * Add a new recipient and send verification email.
     */
    static async addRecipient(scope: OwnerScope, email: string) {
        // Validate email
        const result = emailSchema.safeParse(email)
        if (!result.success) {
            const message = result.error.issues[0]?.message || "Validation failed"
            throw new ValidationError(message)
        }

        const normalizedEmail = email.toLowerCase().trim()

        // Block alias domains to prevent forwarding loops
        const domain = normalizedEmail.split("@")[1]
        if (domain === "anon.li") {
            throw new ValidationError("Cannot use an alias domain as a recipient — this would create a forwarding loop")
        }
        const customDomain = await prisma.domain.findFirst({ where: { domain } })
        if (customDomain) {
            throw new ValidationError("Cannot use an alias domain as a recipient — this would create a forwarding loop")
        }

        // Resolve the plan that governs the recipient limit. In org scope this is
        // the org's own plan (Business), not the creating member's personal plan;
        // the count is already pooled across the org via ownerWhere(scope).
        const user = await getUserById(scope.userId)
        if (!user) {
            throw new NotFoundError("User not found")
        }
        const limitContext = scope.organizationId
            ? await getOrgLimitContext(scope.organizationId)
            : user

        // Purchase-first Teams: an unsubscribed org is a zero-capacity workspace.
        if (scope.organizationId) assertOrgPlanActive(limitContext, "recipients", "alias_recipients")

        // Generate verification token before the transaction
        const verificationToken = randomBytes(32).toString("hex")
        const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

        // Use a serializable transaction to prevent TOCTOU race on the recipient limit
        const recipient = await prisma.$transaction(async (tx) => {
            const existing = await tx.recipient.findFirst({ where: { ...ownerWhere(scope), email: normalizedEmail } })
            if (existing) {
                throw new ConflictError("This email is already in your recipients list")
            }

            const currentCount = await tx.recipient.count({ where: ownerWhere(scope) })
            const limit = getRecipientLimit(limitContext)
            if (currentCount >= limit) {
                throw new ValidationError(`Recipient limit reached (${limit}). Upgrade to add more.`)
            }

            try {
                return await tx.recipient.create({
                    data: {
                        userId: scope.userId,
                        organizationId: scope.organizationId,
                        email: normalizedEmail,
                        verified: false,
                        isDefault: false,
                        verificationToken,
                        verificationExpiry,
                    },
                })
            } catch (error) {
                // Backstop for a concurrent insert that slipped past the check above.
                if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
                    throw new ConflictError("This email is already in your recipients list")
                }
                throw error
            }
        }, { isolationLevel: "Serializable" })

        // Send verification email
        try {
            await sendRecipientVerificationEmail(normalizedEmail, verificationToken)
        } catch (error) {
            // If email fails, delete the recipient and throw
            await deleteRecipientById(recipient.id, scope)
            logger.error("Failed to send verification email", error)
            throw new ValidationError("Failed to send verification email. Please try again.")
        }

        return recipient
    }

    /**
     * Resend verification email for a pending recipient.
     */
    static async resendVerification(scope: OwnerScope, recipientId: string) {
        const recipient = await getRecipientById(recipientId, scope)
        if (!recipient) {
            throw new NotFoundError("Recipient not found")
        }

        if (recipient.verified) {
            throw new ValidationError("Recipient is already verified")
        }

        // Generate new verification token
        const verificationToken = randomBytes(32).toString("hex")
        const verificationExpiry = new Date(Date.now() + 24 * 60 * 60 * 1000) // 24 hours

        await updateRecipient(recipientId, scope, {
            verificationToken,
            verificationExpiry,
        })

        // Send verification email
        await sendRecipientVerificationEmail(recipient.email, verificationToken)

        return { success: true }
    }

    /**
     * Verify a recipient using the verification token (token is the capability).
     */
    static async verifyByToken(token: string) {
        const recipient = await getRecipientByVerificationToken(token)

        if (!recipient) {
            throw new NotFoundError("Invalid verification token")
        }

        if (recipient.verified) {
            return { alreadyVerified: true, recipient }
        }

        if (recipient.verificationExpiry && recipient.verificationExpiry < new Date()) {
            throw new ValidationError("Verification link has expired. Please request a new one.")
        }

        const verified = await verifyRecipient(recipient.id)
        return { alreadyVerified: false, recipient: verified }
    }

    /**
     * Delete a recipient.
     */
    static async deleteRecipient(scope: OwnerScope, recipientId: string) {
        const recipient = await getRecipientByIdWithAliasCount(recipientId, scope)
        if (!recipient) {
            throw new NotFoundError("Recipient not found")
        }
        // Deleting a shared org recipient is destructive for the team → admin+.
        assertCanManage(recipient, scope)

        // Cannot delete default recipient
        if (recipient.isDefault) {
            throw new ValidationError("Cannot delete your default recipient. Set another as default first.")
        }

        // Cannot delete if has active aliases
        if (recipient._count.aliases > 0) {
            throw new ValidationError(`Cannot delete recipient with ${recipient._count.aliases} active alias(es). Remove or reassign them first.`)
        }

        return await deleteRecipientById(recipientId, scope)
    }

    /**
     * Set a recipient as the default.
     */
    static async setAsDefault(scope: OwnerScope, recipientId: string) {
        const recipient = await getRecipientById(recipientId, scope)
        if (!recipient) {
            throw new NotFoundError("Recipient not found")
        }

        if (!recipient.verified) {
            throw new ValidationError("Cannot set an unverified recipient as default")
        }

        return await setDefaultRecipient(scope, recipientId)
    }

    /**
     * Set PGP key for a recipient.
     */
    static async setPgpKey(scope: OwnerScope, recipientId: string, publicKey: string, name?: string) {
        const recipient = await getRecipientById(recipientId, scope)
        if (!recipient) {
            throw new NotFoundError("Recipient not found")
        }

        // Validate PGP key
        const result = pgpKeySchema.safeParse({ publicKey, name })
        if (!result.success) {
            const message = result.error.issues[0]?.message || "Validation failed"
            throw new ValidationError(message)
        }

        // Parse and validate the key with openpgp
        let key
        try {
            key = await openpgp.readKey({ armoredKey: publicKey })
        } catch {
            throw new ValidationError("Invalid PGP key format. Please paste a valid ASCII-armored public key.")
        }

        const fingerprint = key.getFingerprint()

        // The updateMany call returns a count, so we need to fetch the updated recipient to return it
        await updateRecipientPgpKey(recipientId, scope, {
            pgpPublicKey: publicKey,
            pgpFingerprint: fingerprint,
            pgpKeyName: name || null,
        })

        const updatedRecipient = await getRecipientById(recipientId, scope)
        if (!updatedRecipient) {
            throw new NotFoundError("Recipient not found after update")
        }

        return updatedRecipient
    }

    /**
     * Remove PGP key from a recipient.
     */
    static async removePgpKey(scope: OwnerScope, recipientId: string) {
        const recipient = await getRecipientById(recipientId, scope)
        if (!recipient) {
            throw new NotFoundError("Recipient not found")
        }

        await updateRecipientPgpKey(recipientId, scope, {
            pgpPublicKey: null,
            pgpFingerprint: null,
            pgpKeyName: null,
        })

        return { success: true }
    }

    /**
     * Get default recipient for a user (creates one if doesn't exist).
     * Personal context — used by the signup / account flows.
     */
    static async getOrCreateDefaultRecipient(userId: string, userEmail: string) {
        let defaultRecipient = await getDefaultRecipient(personalScope(userId))

        if (!defaultRecipient) {
            // Create default recipient with user's email
            defaultRecipient = await createDefaultRecipientForUser(userId, userEmail)
        }

        return defaultRecipient
    }

    /**
     * Ensure user has a default recipient (called after user creation).
     * Only creates a default if no default exists - does NOT override user's choice.
     */
    static async ensureDefaultRecipient(userId: string, userEmail: string) {
        const scope = personalScope(userId)
        const existingDefault = await getDefaultRecipient(scope)
        if (existingDefault) {
            // User already has a default recipient, don't override their choice
            return existingDefault
        }

        // No default exists - check if user's email is already a recipient
        const existing = await getRecipientByScopeAndEmail(scope, userEmail.toLowerCase())
        if (existing) {
            // Make the existing account email recipient the default
            await setDefaultRecipient(scope, existing.id)
            return existing
        }

        // No recipients at all - create the default with user's email
        return await createDefaultRecipientForUser(userId, userEmail.toLowerCase())
    }
}
