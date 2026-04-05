/**
 * Resource Erasure Pipeline
 *
 * Shared functions for deleting storage objects with retry tracking.
 * Used by the deletion lifecycle, admin takedown, and downgrade cleanup.
 */

import { prisma } from "@/lib/prisma"
import { deleteObject, deleteObjects } from "@/lib/storage"
import { createLogger } from "@/lib/logger"

const logger = createLogger("Erasure")

/**
 * Delete all storage files for a single drop, tracking failures as orphaned files.
 * Returns the list of storage keys that failed deletion.
 */
async function eraseDropFiles(dropId: string): Promise<string[]> {
    const files = await prisma.dropFile.findMany({
        where: { dropId },
        select: { storageKey: true, size: true },
    })

    if (files.length === 0) return []

    const keys = files.map((f) => f.storageKey)
    const failedKeys: string[] = []

    try {
        // Try batch delete first
        await deleteObjects(keys)
    } catch {
        // Fall back to per-file deletion
        for (const file of files) {
            try {
                await deleteObject(file.storageKey)
            } catch (err) {
                logger.error("Failed to delete storage object", err, {
                    dropId,
                    storageKey: file.storageKey,
                })
                failedKeys.push(file.storageKey)
            }
        }
    }

    // Record failed keys for cron retry
    if (failedKeys.length > 0) {
        await prisma.orphanedFile.createMany({
            data: failedKeys.map((key) => ({ storageKey: key })),
        })
    }

    return failedKeys
}

/**
 * Delete all storage files for all drops belonging to a user.
 * Uses cursor-based pagination to handle large accounts.
 * Returns total failed keys count.
 */
export async function eraseUserDrops(userId: string): Promise<{ totalFiles: number; failedKeys: number }> {
    let cursor: string | undefined
    let totalFiles = 0
    let failedKeysCount = 0
    const PAGE_SIZE = 50

    while (true) {
        const drops = await prisma.drop.findMany({
            where: { userId },
            select: { id: true },
            take: PAGE_SIZE,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { id: "asc" },
        })

        if (drops.length === 0) break

        for (const drop of drops) {
            const failed = await eraseDropFiles(drop.id)
            totalFiles++
            failedKeysCount += failed.length
        }

        cursor = drops[drops.length - 1]!.id

        if (drops.length < PAGE_SIZE) break
    }

    return { totalFiles, failedKeys: failedKeysCount }
}

