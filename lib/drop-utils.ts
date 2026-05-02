/**
 * Shared utilities for anon.li Drop feature
 * Handles expiry calculation and validation
 */

import { getDropLimits, getEffectiveTier, type SubscriptionLike } from "@/lib/limits";
import { prisma } from "@/lib/prisma";
import { formatBytes } from "@/lib/utils";
import { ForbiddenError, ValidationError, UpgradeRequiredError } from "@/lib/api-error-utils";

type DropTier = "guest" | "free" | "plus" | "pro";

function nextDropTier(tier: DropTier): "plus" | "pro" {
    return tier === "pro" ? "pro" : tier === "plus" ? "pro" : "plus";
}

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
    userId: string;
    limits: ReturnType<typeof getDropLimits>;
    storageUsed: bigint;
    user: { subscriptions: SubscriptionLike[] } | null;
    tier: DropTier;
}

/**
 * Calculate expiry date based on requested days and plan limits
 */
export function calculateExpiry(
    requestedExpiry: number | undefined,
    maxExpiry: number,
    currentTier: DropTier = "free"
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
        throw new UpgradeRequiredError(
            `Expiry exceeds limit. Max: ${maxExpiry} days on your plan.`,
            {
                scope: "drop_expiry",
                currentTier,
                suggestedTier: nextDropTier(currentTier),
                currentValue: finalExpiryDays,
                limitValue: maxExpiry,
            }
        );
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
export async function getUserAndLimits(userId: string): Promise<UserLimits> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            banned: true,
            banFileUpload: true,
            banReason: true,
            storageUsed: true,
            subscriptions: {
                where: { status: { in: ["active", "trialing"] } },
                select: {
                    status: true,
                    product: true,
                    tier: true,
                    currentPeriodEnd: true,
                },
            },
        },
    });

    if (user) {
        if (user.banned || user.banFileUpload) {
            throw new ForbiddenError(
                user.banned
                    ? user.banReason || "Account suspended"
                    : "File uploads restricted"
            );
        }
        const userRef = { subscriptions: user.subscriptions };
        return {
            userId: user.id,
            limits: getDropLimits(userRef),
            storageUsed: user.storageUsed,
            user: userRef,
            tier: getEffectiveTier(userRef) as DropTier,
        };
    }

    return {
        userId,
        limits: getDropLimits(null),
        storageUsed: BigInt(0),
        user: null,
        tier: "free",
    };
}

/**
 * Validate file size against user limits
 */
export function validateFileSize(
    size: number,
    storageUsed: bigint,
    storageLimit: bigint,
    maxFileSizeLimit?: number,
    currentTier: DropTier = "free"
): void {
    // Per-file size cap
    const perFileCap = maxFileSizeLimit ?? Math.max(0, Number(storageLimit - storageUsed));

    if (size > perFileCap) {
        throw new UpgradeRequiredError(
            `File size exceeds limit. Max: ${formatBytes(perFileCap)} on your plan.`,
            {
                scope: "drop_file_size",
                currentTier,
                suggestedTier: nextDropTier(currentTier),
                currentValue: size,
                limitValue: perFileCap,
            }
        );
    }

    if (storageUsed + BigInt(size) > storageLimit) {
        throw new UpgradeRequiredError(
            "Bandwidth limit reached. Upgrade for more headroom.",
            {
                scope: "drop_bandwidth",
                currentTier,
                suggestedTier: nextDropTier(currentTier),
                currentValue: Number(storageUsed + BigInt(size)),
                limitValue: Number(storageLimit),
            }
        );
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
