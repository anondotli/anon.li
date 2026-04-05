import { prisma } from "@/lib/prisma"
import type { Recipient } from "@prisma/client"

// Type for recipient with alias count from include
type RecipientWithAliasCount = Recipient & { _count: { aliases: number } }

/**
 * Get recipients with alias count for a user
 */
export async function getRecipientsWithAliasCount(userId: string): Promise<RecipientWithAliasCount[]> {
    return await prisma.recipient.findMany({
        where: { userId },
        include: {
            _count: {
                select: { aliases: true }
            }
        },
        orderBy: [
            { isDefault: "desc" },
            { createdAt: "desc" }
        ],
    }) as RecipientWithAliasCount[]
}

/**
 * Get verified recipients for a user (for alias creation dropdown)
 */
export async function getVerifiedRecipientsByUserId(userId: string): Promise<Recipient[]> {
    return await prisma.recipient.findMany({
        where: { 
            userId,
            verified: true 
        },
        orderBy: [
            { isDefault: "desc" },
            { createdAt: "desc" }
        ],
    })
}

/**
 * Get a recipient by ID
 */
export async function getRecipientById(id: string, userId: string): Promise<Recipient | null> {
    return await prisma.recipient.findFirst({
        where: { id, userId }
    })
}

/**
 * Get a recipient by ID with alias count
 */
export async function getRecipientByIdWithAliasCount(id: string, userId: string): Promise<(Recipient & { _count: { aliases: number } }) | null> {
    return await prisma.recipient.findFirst({
        where: { id, userId },
        include: {
            _count: {
                select: { aliases: true }
            }
        }
    })
}

/**
 * Get a recipient by email for a specific user
 */
export async function getRecipientByUserIdAndEmail(userId: string, email: string): Promise<Recipient | null> {
    return await prisma.recipient.findUnique({
        where: { 
            userId_email: { userId, email } 
        }
    })
}

/**
 * Get a recipient by verification token
 */
export async function getRecipientByVerificationToken(token: string): Promise<Recipient | null> {
    return await prisma.recipient.findUnique({
        where: { verificationToken: token }
    })
}

/**
 * Get the default recipient for a user
 */
export async function getDefaultRecipientByUserId(userId: string): Promise<Recipient | null> {
    return await prisma.recipient.findFirst({
        where: { 
            userId, 
            isDefault: true 
        }
    })
}

/**
 * Update a recipient
 */
export async function updateRecipient(id: string, userId: string, data: {
    verified?: boolean
    isDefault?: boolean
    verificationToken?: string | null
    verificationExpiry?: Date | null
    pgpPublicKey?: string | null
    pgpFingerprint?: string | null
    pgpKeyName?: string | null
}) {
    return await prisma.recipient.updateMany({
        where: { id, userId },
        data
    })
}

/**
 * Set a recipient as default and unset all others for the user
 */
export async function setDefaultRecipient(userId: string, recipientId: string): Promise<Recipient> {
    // First, unset all defaults for this user
    await prisma.recipient.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false }
    })

    return await prisma.recipient.update({
        where: { id: recipientId },
        data: { isDefault: true }
    })
}

/**
 * Delete a recipient by ID
 */
export async function deleteRecipientById(id: string, userId: string) {
    return await prisma.recipient.deleteMany({
        where: { id, userId }
    })
}

/**
 * Verify a recipient by setting verified to true and clearing verification token
 */
export async function verifyRecipient(id: string) {
    return await prisma.recipient.update({
        where: { id },
        data: {
            verified: true,
            verificationToken: null,
            verificationExpiry: null
        }
    })
}

/**
 * Update PGP key for a recipient
 */
export async function updateRecipientPgpKey(id: string, userId: string, data: {
    pgpPublicKey: string | null
    pgpFingerprint: string | null
    pgpKeyName: string | null
}) {
    return await prisma.recipient.updateMany({
        where: { id, userId },
        data: {
            pgpPublicKey: data.pgpPublicKey,
            pgpFingerprint: data.pgpFingerprint,
            pgpKeyName: data.pgpKeyName
        }
    })
}

/**
 * Create a default recipient for a new user (called during user creation)
 */
export async function createDefaultRecipientForUser(userId: string, email: string): Promise<Recipient> {
    return await prisma.recipient.create({
        data: {
            userId,
            email: email.toLowerCase(),
            verified: true,  // User's own email is pre-verified
            isDefault: true,
        }
    })
}