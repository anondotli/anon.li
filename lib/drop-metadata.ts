import "server-only";

import type { DropMetadata } from "@/lib/drop.client";
import { DropService } from "@/lib/services/drop";

export async function getPublicDropMetadata(dropId: string): Promise<DropMetadata | null> {
    const drop = await DropService.getDropWithFiles(dropId);

    if (!drop) {
        return null;
    }

    return {
        id: drop.id,
        encryptedTitle: drop.encryptedTitle,
        encryptedMessage: drop.encryptedMessage,
        iv: drop.iv,
        customKey: drop.customKey,
        salt: drop.salt,
        customKeyData: drop.customKeyData,
        customKeyIv: drop.customKeyIv,
        downloads: drop.downloads,
        maxDownloads: drop.maxDownloads,
        expiresAt: drop.expiresAt?.toISOString() ?? null,
        hideBranding: drop.hideBranding,
        createdAt: drop.createdAt.toISOString(),
        files: drop.files.map((file) => ({
            id: file.id,
            encryptedName: file.encryptedName,
            size: file.size,
            mimeType: file.mimeType,
            iv: file.iv,
            chunkSize: file.chunkSize ?? null,
            chunkCount: file.chunkCount ?? null,
        })),
    };
}
