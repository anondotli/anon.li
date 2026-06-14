import { prisma } from "@/lib/prisma"
import type { Recipient } from "@prisma/client"
import { ownerWhere, type OwnerScope } from "@/lib/ownership"

// Type for recipient with alias count from include
type RecipientWithAliasCount = Recipient & { _count: { aliases: number } }

/**
 * Get recipients with alias count within an owner scope.
 */
export async function getRecipientsWithAliasCount(scope: OwnerScope): Promise<RecipientWithAliasCount[]> {
    return await prisma.recipient.findMany({
        where: ownerWhere(scope),
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
 * Get verified recipients within a scope (for alias creation dropdown).
 */
export async function getVerifiedRecipients(scope: OwnerScope): Promise<Recipient[]> {
    return await prisma.recipient.findMany({
        where: {
            ...ownerWhere(scope),
            verified: true
        },
        orderBy: [
            { isDefault: "desc" },
            { createdAt: "desc" }
        ],
    })
}

/**
 * Get a recipient by ID within a scope.
 */
export async function getRecipientById(id: string, scope: OwnerScope): Promise<Recipient | null> {
    return await prisma.recipient.findFirst({
        where: { id, ...ownerWhere(scope) }
    })
}

/**
 * Get a recipient by ID with alias count, within a scope.
 */
export async function getRecipientByIdWithAliasCount(id: string, scope: OwnerScope): Promise<(Recipient & { _count: { aliases: number } }) | null> {
    return await prisma.recipient.findFirst({
        where: { id, ...ownerWhere(scope) },
        include: {
            _count: {
                select: { aliases: true }
            }
        }
    })
}

/**
 * Get a recipient by email within a scope.
 */
export async function getRecipientByScopeAndEmail(scope: OwnerScope, email: string): Promise<Recipient | null> {
    return await prisma.recipient.findFirst({
        where: { ...ownerWhere(scope), email }
    })
}

/**
 * Get a recipient by verification token (token is globally unique; no scope).
 */
export async function getRecipientByVerificationToken(token: string): Promise<Recipient | null> {
    return await prisma.recipient.findUnique({
        where: { verificationToken: token }
    })
}

/**
 * Get the default recipient within a scope.
 */
export async function getDefaultRecipient(scope: OwnerScope): Promise<Recipient | null> {
    return await prisma.recipient.findFirst({
        where: { ...ownerWhere(scope), isDefault: true }
    })
}

/**
 * Update a recipient within a scope.
 */
export async function updateRecipient(id: string, scope: OwnerScope, data: {
    verified?: boolean
    isDefault?: boolean
    verificationToken?: string | null
    verificationExpiry?: Date | null
    pgpPublicKey?: string | null
    pgpFingerprint?: string | null
    pgpKeyName?: string | null
}) {
    return await prisma.recipient.updateMany({
        where: { id, ...ownerWhere(scope) },
        data
    })
}

/**
 * Set a recipient as default and unset all others within the scope.
 */
export async function setDefaultRecipient(scope: OwnerScope, recipientId: string): Promise<Recipient> {
    // First, unset all defaults within this scope
    await prisma.recipient.updateMany({
        where: { ...ownerWhere(scope), isDefault: true },
        data: { isDefault: false }
    })

    return await prisma.recipient.update({
        where: { id: recipientId },
        data: { isDefault: true }
    })
}

/**
 * Delete a recipient by ID within a scope.
 */
export async function deleteRecipientById(id: string, scope: OwnerScope) {
    return await prisma.recipient.deleteMany({
        where: { id, ...ownerWhere(scope) }
    })
}

/**
 * Verify a recipient by setting verified to true and clearing verification token.
 * Keyed by id from a verified token lookup — no scope needed.
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
 * Update PGP key for a recipient within a scope.
 */
export async function updateRecipientPgpKey(id: string, scope: OwnerScope, data: {
    pgpPublicKey: string | null
    pgpFingerprint: string | null
    pgpKeyName: string | null
}) {
    return await prisma.recipient.updateMany({
        where: { id, ...ownerWhere(scope) },
        data: {
            pgpPublicKey: data.pgpPublicKey,
            pgpFingerprint: data.pgpFingerprint,
            pgpKeyName: data.pgpKeyName
        }
    })
}

/**
 * Create a default recipient for a new user (called during user creation —
 * always personal context).
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
