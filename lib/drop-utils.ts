/**
 * Shared utilities for anon.li Drop feature
 * Handles session tokens, expiry calculation, and validation
 */

import crypto from "crypto";
import { prisma } from "@/lib/prisma";
import { getDropLimits } from "@/lib/limits";
import { getUserById } from "@/lib/data/user";
import { DROP_SIZE_LIMITS } from "@/config/plans";
import { formatBytes } from "@/lib/utils";
import { ValidationError } from "@/lib/api-error-utils";

// Session token configuration
const SESSION_TOKEN_LENGTH = 32; // 256 bits
const SESSION_TOKEN_EXPIRY = 4 * 60 * 60 * 1000; // 4 hours

// Input length limits for security
const INPUT_LIMITS = {
    iv: 64,
    encryptedTitle: 1024,
    encryptedMessage: 4096,
    salt: 128,
    customKeyData: 512,
    customKeyIv: 64,
} as const;

interface UserLimits {
    userId: string | null;
    limits: ReturnType<typeof getDropLimits>;
    storageUsed: bigint;
    user: { stripePriceId: string | null; stripeCurrentPeriodEnd: Date | null } | null;
}

/**
 * Generate a cryptographically secure session token for anonymous uploads
 * This replaces IP hash storage for better privacy
 */
export function generateSessionToken(): string {
    return crypto.randomBytes(SESSION_TOKEN_LENGTH).toString("base64url");
}

/**
 * Hash a session token for storage (we never store raw tokens)
 */
function hashSessionToken(token: string): string {
    return crypto.createHash("sha256").update(token).digest("hex");
}

/**
 * Get session token expiry timestamp
 */
function getSessionTokenExpiry(): Date {
    return new Date(Date.now() + SESSION_TOKEN_EXPIRY);
}

/**
 * Calculate expiry date based on requested days and plan limits
 */
export function calculateExpiry(
    requestedExpiry: number | undefined,
    maxExpiry: number
): Date | null {
    const hasUnlimitedExpiry = maxExpiry === -1;
    let finalExpiryDays = requestedExpiry;

    // Default to max expiry if not specified
    if (!finalExpiryDays) {
        finalExpiryDays = hasUnlimitedExpiry ? 0 : maxExpiry;
    }

    // Enforce max expiry for non-unlimited plans
    if (!hasUnlimitedExpiry && finalExpiryDays === 0) {
        finalExpiryDays = maxExpiry;
    }

    // Check against limits
    if (!hasUnlimitedExpiry && finalExpiryDays > maxExpiry) {
        throw new ValidationError(`Expiry exceeds limit. Max: ${maxExpiry} days`);
    }

    if (finalExpiryDays < 0) {
        throw new ValidationError("Expiry cannot be negative");
    }

    // No expiry (unlimited)
    if (finalExpiryDays === 0) {
        return null;
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + finalExpiryDays);
    return expiresAt;
}

/**
 * Get user and their limits, with ban checking
 */
export async function getUserAndLimits(userId: string | null): Promise<UserLimits> {
    if (!userId) {
        return {
            userId: null,
            limits: getDropLimits(null),
            storageUsed: BigInt(0),
            user: null,
        };
    }

    const user = await getUserById(userId);
    if (user) {
        if (user.banned || user.banFileUpload) {
            throw new Error(
                user.banned
                    ? user.banReason || "Account suspended"
                    : "File uploads restricted"
            );
        }
        return {
            userId: user.id,
            limits: getDropLimits(user),
            storageUsed: user.storageUsed,
            user: { stripePriceId: user.stripePriceId, stripeCurrentPeriodEnd: user.stripeCurrentPeriodEnd },
        };
    }

    return {
        userId: null,
        limits: getDropLimits(null),
        storageUsed: BigInt(0),
        user: null,
    };
}

/**
 * Validate file size against user limits
 */
export function validateFileSize(
    size: number,
    storageUsed: bigint,
    storageLimit: bigint,
    isGuest: boolean,
    maxFileSizeLimit?: number
): void {
    // Per-file size cap: guest uses guest limit, authenticated uses tier limit
    const perFileCap = isGuest
        ? DROP_SIZE_LIMITS.guest
        : maxFileSizeLimit ?? Math.max(0, Number(storageLimit - storageUsed));

    if (size > perFileCap) {
        throw new Error(`File size exceeds limit. Max: ${formatBytes(perFileCap)}`);
    }

    if (!isGuest && storageUsed + BigInt(size) > storageLimit) {
        throw new Error("Storage limit exceeded. Please upgrade your plan.");
    }
}

/**
 * Validate input string lengths to prevent abuse
 */
export function validateInputLengths(input: {
    iv?: string;
    encryptedTitle?: string;
    encryptedMessage?: string;
    salt?: string;
    customKeyData?: string;
    customKeyIv?: string;
}): void {
    if (input.iv && input.iv.length > INPUT_LIMITS.iv) {
        throw new Error("IV too long");
    }
    if (input.encryptedTitle && input.encryptedTitle.length > INPUT_LIMITS.encryptedTitle) {
        throw new Error("Title too long");
    }
    if (input.encryptedMessage && input.encryptedMessage.length > INPUT_LIMITS.encryptedMessage) {
        throw new Error("Message too long");
    }
    if (input.salt && input.salt.length > INPUT_LIMITS.salt) {
        throw new Error("Invalid salt");
    }
    if (input.customKeyData && input.customKeyData.length > INPUT_LIMITS.customKeyData) {
        throw new Error("Invalid encrypted key");
    }
    if (input.customKeyIv && input.customKeyIv.length > INPUT_LIMITS.customKeyIv) {
        throw new Error("Invalid password IV");
    }
}

/**
 * Enforce feature flags based on user plan (silently downgrade)
 */
export function enforceFeatureFlags(
    requested: {
        hideBranding?: boolean;
        notifyOnDownload?: boolean;
        customKey?: boolean;
    },
    features: {
        noBranding: boolean;
        downloadNotifications: boolean;
        customKey: boolean;
    }
): {
    hideBranding: boolean;
    notifyOnDownload: boolean;
    customKey: boolean;
} {
    return {
        hideBranding: (requested.hideBranding ?? false) && features.noBranding,
        notifyOnDownload: (requested.notifyOnDownload ?? false) && features.downloadNotifications,
        customKey: (requested.customKey ?? false) && features.customKey,
    };
}

/**
 * Store a session token for a drop (for anonymous upload verification)
 */
export async function storeDropSession(
    dropId: string,
    sessionToken: string
): Promise<void> {
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = getSessionTokenExpiry();

    await prisma.uploadToken.create({
        data: {
            dropId,
            tokenHash,
            expiresAt,
        },
    });
}

/**
 * Verify a session token for a drop
 */
export async function verifyDropSession(
    dropId: string,
    sessionToken: string
): Promise<boolean> {
    const tokenHash = hashSessionToken(sessionToken);

    const session = await prisma.uploadToken.findFirst({
        where: {
            dropId,
            tokenHash,
            expiresAt: { gt: new Date() },
        },
    });

    return !!session;
}

/**
 * Invalidate all session tokens for a drop (called after completion)
 */
export async function invalidateDropSessions(dropId: string): Promise<void> {
    await prisma.uploadToken.deleteMany({
        where: { dropId },
    });
}

/**
 * Clean up expired session tokens
 */
export async function cleanupExpiredSessions(): Promise<number> {
    const result = await prisma.uploadToken.deleteMany({
        where: {
            expiresAt: { lt: new Date() },
        },
    });

    return result.count;
}
