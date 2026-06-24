"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { DropService, type CreatedRecipient, type RecipientListItem, type AccessEventItem } from "@/lib/services/drop"
import { resolveDownloadAccess, consumeRecipientDownload, recordAccessEvent } from "@/lib/services/drop-recipient"
import { rateLimit, getClientIp } from "@/lib/rate-limit"
import { getChunkPresignedUrls, getPresignedDownloadUrl, LIMITED_DROP_PRESIGNED_URL_EXPIRES } from "@/lib/storage"
import { prisma } from "@/lib/prisma"
import type { DropMetadata } from "@/lib/drop.client"
import { getPublicDropMetadata } from "@/lib/drop-metadata"
import { z } from "zod"
import { createLogger } from "@/lib/logger"
import { type ActionState, runScopedAction } from "@/lib/safe-action"
import { addFileActionSchema, addRecipientsSchema } from "@/lib/validations/drop"
import { assertVaultIdentity } from "@/lib/vault/identity"
import type { UpgradeRequiredDetails } from "@/lib/api-error-utils"
import {
    DropOwnerKeyConflictError,
    persistOwnedDropKey,
} from "@/lib/vault/drop-owner-keys"
import { getOrgKeyGeneration } from "@/lib/vault/org-access"
import {
    vaultGenerationSchema,
    vaultIdSchema,
    wrappedDropKeySchema,
} from "@/lib/vault/validation"

const logger = createLogger("DropActions")

// ============================================================================
// Types for Drop List
// ============================================================================

interface DropFileData {
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
    restrictToRecipients: boolean
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
    // Present only for org-context drops: the wrappedKey is wrapped to the org
    // vault key (not the creator's personal vault) at this generation, so any
    // granted team member can open it. The trusted scope (not this field)
    // decides org-ownership; this only records which org key generation was used.
    orgKeyGeneration: z.number().int().positive().optional(),
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
    await assertVaultIdentity(userId, vaultId, vaultGeneration)
    await persistOwnedDropKey(prisma, userId, dropId, wrappedKey, vaultGeneration)
}

// Org-context drops: the wrappedKey is wrapped to the ORG vault key (not the
// creator's personal vault), so there is no personal vault identity to assert.
// Ownership is anchored to the org via organizationId; any granted member can
// later open it. We still record the creator (userId). The org key generation is
// resolved SERVER-side (not trusted from the client): a readable wrap must be to
// the current org key, so the recorded generation must be the org's current one.
async function persistOrgDropOwnerKey(
    userId: string,
    dropId: string,
    wrappedKey: string,
    vaultGeneration: number,
    organizationId: string,
) {
    const orgKeyGeneration = await getOrgKeyGeneration(organizationId)
    if (orgKeyGeneration < 1) {
        throw new Error("Team encryption key is not set up yet")
    }
    await persistOwnedDropKey(prisma, userId, dropId, wrappedKey, vaultGeneration, { organizationId, orgKeyGeneration })
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
    const result = await runScopedAction(
        { schema: createDropSchema, data: input, rateLimitKey: "dropCreate" },
        async (validated, scope): Promise<CreateDropActionResult> => {
            // Owner key + rollback bind to the creating user. In org context the
            // wrappedKey is wrapped to the org vault key (shared with the team);
            // in personal context it is bound to the user's own vault.
            const userId = scope.userId
            // orgKeyGeneration is stripped from the client payload but ignored —
            // the trusted server scope decides org-ownership and resolves the org
            // key generation authoritatively (see persistOrgDropOwnerKey).
            const { wrappedKey, vaultId, vaultGeneration, orgKeyGeneration: _ignoredOrgGen, ...dropInput } = validated

            const result = await DropService.createDrop(scope, dropInput)

            try {
                if (scope.organizationId) {
                    await persistOrgDropOwnerKey(
                        userId,
                        result.dropId,
                        wrappedKey,
                        vaultGeneration,
                        scope.organizationId,
                    )
                } else {
                    await persistDropOwnerKey(
                        userId,
                        result.dropId,
                        wrappedKey,
                        vaultId,
                        vaultGeneration
                    )
                }
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
    const result = await runScopedAction(
        { schema: addFileSchema, data: input, rateLimitKey: "fileUploadAuth" },
        async (validated, scope): Promise<AddFileActionResult> => {
            const result = await DropService.addFile(scope, validated)

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
    const result = await runScopedAction(
        { schema: finishDropSchema, data: input, rateLimitKey: "dropOps" },
        async (validated, scope): Promise<FinishDropActionResult> => {
            const { dropId, files } = validated

            await DropService.finishDrop(dropId, files, scope)

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
    return runScopedAction({ rateLimitKey: "dropOps" }, async (_, scope) => {
        const disabled = await DropService.toggleDrop(dropId, scope)
        revalidatePath("/dashboard/drop")
        return { disabled }
    })
}

/**
 * Deletes a drop and all its files permanently.
 */
export async function deleteDropAction(dropId: string): Promise<ActionState> {
    return runScopedAction({ rateLimitKey: "dropOps" }, async (_, scope) => {
        await DropService.deleteDrop(dropId, scope)
        revalidatePath("/dashboard/drop")
    })
}

// ============================================================================
// Server Actions for Recipients & Access Log
// ============================================================================

export type AddRecipientsActionResult = {
    error?: string
    code?: string
    upgrade?: UpgradeRequiredDetails
    recipients?: CreatedRecipient[]
}

/**
 * Add named recipients to a drop (and optionally restrict downloads to them).
 * Returns each recipient's raw access token ONCE so the client can build the
 * share link with the decryption key in the fragment — the server never sees it.
 */
export async function addDropRecipientsAction(
    input: z.infer<typeof addRecipientsSchema>
): Promise<AddRecipientsActionResult> {
    const result = await runScopedAction(
        { schema: addRecipientsSchema, data: input, rateLimitKey: "dropOps" },
        async (validated, scope): Promise<AddRecipientsActionResult> => {
            const recipients = await DropService.addRecipients(
                scope,
                validated.dropId,
                validated.recipients.map((r) => ({
                    email: r.email,
                    label: r.label ?? null,
                    maxDownloads: r.maxDownloads ?? null,
                    expiresAt: r.expiresAt ? new Date(r.expiresAt) : null,
                })),
                { restrict: validated.restrict, notify: validated.notify },
            )
            revalidatePath("/dashboard/drop")
            return { recipients }
        }
    )

    if (result.error) return { error: result.error, code: result.code, upgrade: result.upgrade }
    return result.data ?? { error: "Failed to add recipients" }
}

/** List a drop's recipients (owner only). */
export async function listDropRecipientsAction(
    dropId: string
): Promise<ActionState<{ recipients: RecipientListItem[] }>> {
    return runScopedAction({ rateLimitKey: "dropOps" }, async (_, scope) => {
        const recipients = await DropService.listRecipients(scope, dropId)
        return { recipients }
    })
}

/** Revoke a single recipient's future access (owner only). */
export async function revokeDropRecipientAction(
    dropId: string,
    recipientId: string
): Promise<ActionState> {
    return runScopedAction({ rateLimitKey: "dropOps" }, async (_, scope) => {
        await DropService.revokeRecipient(scope, dropId, recipientId)
        revalidatePath("/dashboard/drop")
    })
}

/** List a drop's per-download access log (owner only; requires accessLogs entitlement). */
export async function listDropAccessEventsAction(
    dropId: string
): Promise<ActionState<{ events: AccessEventItem[] }>> {
    return runScopedAction({ rateLimitKey: "dropOps" }, async (_, scope) => {
        const events = await DropService.listAccessEvents(scope, dropId)
        return { events }
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
export async function recordDownloadAction(
    dropId: string,
    recipientToken?: string,
): Promise<RecordDownloadActionResult> {
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

        // Per-recipient access gate (zero-knowledge: token gates ciphertext only).
        const access = await resolveDownloadAccess(dropId, drop.restrictToRecipients, recipientToken ?? null)
        if (!access.allowed) {
            return { error: "This drop is not available." }
        }
        if (access.recipientId) {
            const ok = await consumeRecipientDownload(access.recipientId)
            if (!ok) {
                return { error: "Download limit reached." }
            }
        }

        const incremented = await DropService.incrementDownloadCount(dropId)
        if (!incremented) {
            return { error: "Download limit reached." }
        }

        // Limited drops get short-lived URLs so an issued download can't be
        // replayed long after the count was spent (the byte transfer happens at
        // R2, which we can't count). Unlimited drops keep the default TTL.
        const expiresIn = drop.maxDownloads ? LIMITED_DROP_PRESIGNED_URL_EXPIRES : undefined
        const downloadUrls: Record<string, string> = {}
        for (const file of drop.files) {
            downloadUrls[file.id] = await getPresignedDownloadUrl(file.storageKey, expiresIn)
        }

        // Owner-facing access log: one event for the whole-drop (ZIP) download.
        const userAgent = (await headers()).get("user-agent")
        void recordAccessEvent({
            dropId,
            recipientId: access.recipientId,
            eventType: "zip_all",
            ip: clientIp,
            userAgent,
        })

        return { downloadUrls }
    } catch (error) {
        logger.error("recordDownloadAction error", error)
        return { error: "Failed to record download" }
    }
}
