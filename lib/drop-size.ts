import {
    AUTH_TAG_SIZE,
    MAX_CHUNKS_PER_FILE,
    MIN_MULTIPART_PART_SIZE,
} from "@/lib/constants"

/** Recover plaintext bytes from the authenticated multipart representation. */
export function plaintextSizeFromEncrypted(encryptedSize: number, chunkCount: number): number {
    return encryptedSize - chunkCount * AUTH_TAG_SIZE
}

/**
 * Convert a plaintext plan/storage limit into a tightly bounded ciphertext
 * ceiling. Quota remains charged in real ciphertext bytes, while AES-GCM's
 * required 16-byte tag per valid part does not make an exact-limit plaintext
 * upload fail. The 5 MiB non-final S3 minimum bounds the possible part count;
 * each file may additionally contribute one short final part.
 */
export function encryptedStorageLimit(
    plaintextLimit: bigint,
    maxFiles: number,
): bigint {
    if (plaintextLimit < BigInt(0) || !Number.isSafeInteger(maxFiles) || maxFiles < 1) {
        throw new RangeError("Invalid storage limit")
    }

    const minPartSize = BigInt(MIN_MULTIPART_PART_SIZE)
    const sizeBound = (plaintextLimit + minPartSize - BigInt(1)) / minPartSize + BigInt(maxFiles)
    const protocolBound = BigInt(MAX_CHUNKS_PER_FILE) * BigInt(maxFiles)
    const maxParts = sizeBound < protocolBound ? sizeBound : protocolBound

    return plaintextLimit + maxParts * BigInt(AUTH_TAG_SIZE)
}
