import { prisma } from "@/lib/prisma";

/**
 * Decrement a user's storageUsed with a GREATEST(0, ...) floor to prevent negative values.
 * Protects against double-decrement bugs (e.g. cron + normal delete race).
 */
export async function decrementStorageUsed(userId: string, size: bigint): Promise<void> {
    if (size <= BigInt(0)) return;
    await prisma.$executeRaw`
        UPDATE "users"
        SET "storageUsed" = GREATEST(0, "storageUsed" - ${size})
        WHERE "id" = ${userId}
    `;
}
