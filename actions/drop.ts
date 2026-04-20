"use server"

import { revalidatePath } from "next/cache"
import { DropService } from "@/lib/services/drop"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { getChunkPresignedUrls, getPresignedDownloadUrl } from "@/lib/storage"
import { prisma } from "@/lib/prisma"
import type { DropMetadata } from "@/lib/drop.client"
import { getPublicDropMetadata } from "@/lib/drop-metadata"
import { z } from "zod"
import { createLogger } from "@/lib/logger"
import { type ActionState, runSecureAction } from "@/lib/safe-action"
import { addFileActionSchema } from "@/lib/validations/drop"
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils"
import {
    DropOwnerKeyConflictError,
    persistOwnedDropKey,
} from "@/lib/vault/drop-owner-keys"
import {
    vaultGenerationSchema,
    vaultIdSchema,
    wrappedDropKeySchema,
} from "@/lib/vault/validation"

const logger = createLogger("DropActions")

// ============================================================================
// Types for Drop List
// ============================================================================

export interface DropFileData {
    id: string
    encryptedName: string
    size: string
    mimeType: string
    iv: string
}

export interface DropData {
    id: string
    encryptedTitle: string | null
    iv: string
    downloads: number
    maxDownloads: number | null
    expiresAt: string | null
    customKey: boolean
    hideBranding: boolean
    disabled: boolean
    takenDown: boolean
    takedownReason: string | null
    uploadComplete: boolean
    createdAt: string
    files: DropFileData[]
    fileCount: number
    totalSize: string
}

export interface StorageData {
    used: string
    limit: string
}

// ============================================================================
// Schemas
// ============================================================================

const createDropSchema = z.object({
    iv: z.string().length(16),
    encryptedTitle: z.string().max(1024).optional(),
    encryptedMessage: z.string().max(4096).optional(),
    expiry: z.number().min(1).max(30).optional(),
    maxDownloads: z.number().min(1).optional(),
    customKey: z.boolean().optional(),
    salt: z.string().length(43).optional(),
    customKeyData: z.string().min(70).max(512).optional(),
    customKeyIv: z.string().length(16).optional(),
    hideBranding: z.boolean().optional(),
    notifyOnDownload: z.boolean().optional(),
    fileCount: z.number().int().positive().optional(),
    wrappedKey: wrappedDropKeySchema,
    vaultId: vaultIdSchema,
    vaultGeneration: vaultGenerationSchema,
}).refine((data) => {
    if (data.customKey) {
        return !!data.salt && !!data.customKeyData && !!data.customKeyIv;
    }
    return true;
}, {
    message: "Custom key drops must include salt, encrypted key, and IV",
    path: ["customKey"],
});

// addFileActionSchema imported from @/lib/validations/drop
const addFileSchema = addFileActionSchema;

const finishDropSchema = z.object({
    dropId: z.string().min(1),
    files: z.array(z.object({
        fileId: z.string().min(1),
        chunks: z.array(z.object({
            chunkIndex: z.number().int().min(0),
            etag: z.string().min(1),
        })).min(1),
    })).min(1),
});

// ============================================================================
// Response Types
// ============================================================================

export type CreateDropActionResult = {
    error?: string
    code?: string
    upgrade?: UpgradeRequiredDetails
    dropId?: string
    expiresAt?: string | null
}

export type AddFileActionResult = {
    error?: string
    code?: string
    upgrade?: UpgradeRequiredDetails
    fileId?: string
    s3UploadId?: string
    uploadUrls?: Record<number, string>
}

export type FinishDropActionResult = {
    error?: string
    success?: boolean
}

async function persistDropOwnerKey(userId: string, dropId: string, wrappedKey: string, vaultId: string, vaultGeneration: number) {
    const security = await prisma.userSecurity.findUnique({
        where: { userId },
        select: { id: true, vaultGeneration: true },
    })

    if (!security) {
        throw new Error("Vault security is not configured")
    }

    if (security.id !== vaultId) {
        throw new Error("Vault identity mismatch")
    }

    if (security.vaultGeneration !== vaultGeneration) {
        throw new Error("Vault generation mismatch")
    }

    await persistOwnedDropKey(prisma, userId, dropId, wrappedKey, vaultGeneration)
}

// ============================================================================
// Server Actions for Upload Flow
// ============================================================================

/**
 * Create a new drop (collection for grouping files).
 * Requires authentication.
 */
export async function createDropAction(
    input: z.infer<typeof createDropSchema>
): Promise<CreateDropActionResult> {
    const result = await runSecureAction(
        { schema: createDropSchema, data: input, rateLimitKey: "dropCreate" },
        async (validated, userId): Promise<CreateDropActionResult> => {
            const { wrappedKey, vaultId, vaultGeneration, ...dropInput } = validated
            const result = await DropService.createDrop(userId, dropInput)

            try {
                await persistDropOwnerKey(
                    userId,
                    result.dropId,
                    wrappedKey,
                    vaultId,
                    vaultGeneration
                )
            } catch (keyError) {
                if (keyError instanceof DropOwnerKeyConflictError) {
                    logger.warn("Drop owner key persistence rejected due to ownership conflict", {
                        dropId: result.dropId,
                        userId,
                    })
                }
                logger.error("Failed to persist drop owner key", keyError, { dropId: result.dropId, userId })
                await prisma.drop.deleteMany({
                    where: {
                        id: result.dropId,
                        userId,
                        uploadComplete: false,
                    },
                }).catch((cleanupError) => {
                    logger.error("Failed to roll back drop after key persistence error", cleanupError, {
                        dropId: result.dropId,
                        userId,
                    })
                })
                return { error: "Failed to store drop encryption key" }
            }

            return {
                dropId: result.dropId,
                expiresAt: result.expiresAt?.toISOString() || null,
            }
        }
    )

    if (result.error) return { error: result.error, code: result.code, upgrade: result.upgrade }
    return result.data ?? { error: "Failed to create drop" }
}

/**
 * Add a file to an existing drop.
 * Returns presigned URLs for chunk uploads.
 */
export async function addFileToDropAction(
    input: z.infer<typeof addFileSchema>
): Promise<AddFileActionResult> {
    const result = await runSecureAction(
        { schema: addFileSchema, data: input, rateLimitKey: "fileUploadAuth" },
        async (validated, userId): Promise<AddFileActionResult> => {
            const result = await DropService.addFile(userId, validated)

            // Generate presigned URLs for chunk uploads
            const partNumbers = Array.from(
                { length: validated.chunkCount },
                (_, i) => i + 1
            )
            const uploadUrls = await getChunkPresignedUrls(
                result.storageKey,
                result.s3UploadId,
                partNumbers
            )

            return {
                fileId: result.fileId,
                s3UploadId: result.s3UploadId,
                uploadUrls,
            }
        }
    )

    if (result.error) return { error: result.error, code: result.code, upgrade: result.upgrade }
    return result.data ?? { error: "Failed to add file" }
}

/**
 * Batch finalize a drop: record all chunks, complete all files, complete the drop.
 * Replaces three sequential round-trips with one.
 */
export async function finishDropAction(
    input: z.infer<typeof finishDropSchema>
): Promise<FinishDropActionResult> {
    const result = await runSecureAction(
        { schema: finishDropSchema, data: input, rateLimitKey: "dropOps" },
        async (validated, userId): Promise<FinishDropActionResult> => {
            const { dropId, files } = validated

            await DropService.finishDrop(dropId, files, userId)

            revalidatePath("/dashboard/drop")
            return { success: true }
        }
    )

    if (result.error) return { error: result.error }
    return result.data ?? { error: "Failed to finish drop" }
}

/**
 * Toggles the disabled state of a drop (link revocation).
 * When disabled, the download link will not work.
 */
export async function toggleDropAction(dropId: string): Promise<ActionState<{ disabled: boolean }>> {
    return runSecureAction({ rateLimitKey: "dropOps" }, async (_, userId) => {
        const disabled = await DropService.toggleDrop(dropId, userId)
        revalidatePath("/dashboard/drop")
        return { disabled }
    })
}

/**
 * Deletes a drop and all its files permanently.
 */
export async function deleteDropAction(dropId: string): Promise<ActionState> {
    return runSecureAction({ rateLimitKey: "dropOps" }, async (_, userId) => {
        await DropService.deleteDrop(dropId, userId)
        revalidatePath("/dashboard/drop")
    })
}

// ============================================================================
// Server Actions for Download Flow
// ============================================================================

export type GetDropActionResult = {
    error?: string
    drop?: DropMetadata
}

export type RecordDownloadActionResult = {
    error?: string
    downloadUrls?: Record<string, string>
}

/**
 * Get drop metadata for the public download page.
 * No auth required - rate-limited by IP.
 */
export async function getDropAction(dropId: string): Promise<GetDropActionResult> {
    try {
        // Rate limiting by IP
        const clientIp = await getClientIp()
        const rateLimited = await rateLimit("dropMetadata", clientIp)
        if (rateLimited) {
            return { error: "Too many requests. Please try again later." }
        }

        if (!dropId || typeof dropId !== "string" || dropId.length < 1) {
            return { error: "Invalid drop ID" }
        }

        const drop = await getPublicDropMetadata(dropId)
        if (!drop) {
            return { error: "Drop not found" }
        }

        return { drop }
    } catch (error) {
        logger.error("getDropAction error", error)
        return { error: "Failed to load drop" }
    }
}

/**
 * Record a download and return signed URLs for all files.
 * No auth required - rate-limited by IP.
 */
export async function recordDownloadAction(dropId: string): Promise<RecordDownloadActionResult> {
    try {
        // Rate limiting by IP
        const clientIp = await getClientIp()
        const rateLimited = await rateLimit("dropDownload", clientIp)
        if (rateLimited) {
            return { error: "Too many requests. Please try again later." }
        }

        if (!dropId || typeof dropId !== "string" || dropId.length < 1) {
            return { error: "Invalid drop ID" }
        }

        // Fetch drop and verify access before incrementing download count
        const drop = await prisma.drop.findUnique({
            where: { id: dropId },
            include: { files: { select: { id: true, storageKey: true } } },
        })

        if (!drop || drop.deletedAt) {
            return { error: "Drop not found" }
        }

        if (drop.takenDown) {
            return { error: "This drop has been removed due to a policy violation." }
        }

        if (drop.disabled) {
            return { error: "This link has been disabled by the owner." }
        }

        if (!drop.uploadComplete) {
            return { error: "This drop is not yet available." }
        }

        if (drop.maxDownloads && drop.downloads >= drop.maxDownloads) {
            return { error: "Download limit reached." }
        }

        if (drop.expiresAt && new Date() > drop.expiresAt) {
            return { error: "This drop has expired." }
        }

        const incremented = await DropService.incrementDownloadCount(dropId)
        if (!incremented) {
            return { error: "Download limit reached." }
        }

        const downloadUrls: Record<string, string> = {}
        for (const file of drop.files) {
            downloadUrls[file.id] = await getPresignedDownloadUrl(file.storageKey)
        }

        return { downloadUrls }
    } catch (error) {
        logger.error("recordDownloadAction error", error)
        return { error: "Failed to record download" }
    }
}
