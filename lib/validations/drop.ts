import { z } from "zod";
import {
    AUTH_TAG_SIZE,
    MAX_CHUNKS_PER_FILE,
    MAX_DROP_ENCRYPTED_FILE_SIZE,
    MAX_DROP_PLAINTEXT_FILE_SIZE,
    MIN_MULTIPART_PART_SIZE,
} from "@/lib/constants";
import { plaintextSizeFromEncrypted } from "@/lib/drop-size";

// Shared refinement validators
function chunkSizeValid(data: { chunkCount: number; chunkSize: number }) {
    if (data.chunkCount === 1) return true;
    return data.chunkSize >= MIN_MULTIPART_PART_SIZE;
}

function chunkConsistencyValid(data: { chunkCount: number; chunkSize: number; size: number }) {
    if (data.chunkCount === 1) return true;
    const encryptedChunkSize = data.chunkSize + AUTH_TAG_SIZE;
    const min = (data.chunkCount - 1) * encryptedChunkSize + (AUTH_TAG_SIZE + 1);
    const max = data.chunkCount * encryptedChunkSize;
    return data.size >= min && data.size <= max;
}

function plaintextSizeValid(data: { chunkCount: number; size: number }) {
    const plaintextSize = plaintextSizeFromEncrypted(data.size, data.chunkCount);
    return plaintextSize > 0 && plaintextSize <= MAX_DROP_PLAINTEXT_FILE_SIZE;
}

const fileFields = {
    // `size` is encrypted bytes. The bounded allowance covers at most one
    // 16-byte AES-GCM tag for every protocol-valid part.
    size: z.number().int().positive().max(MAX_DROP_ENCRYPTED_FILE_SIZE),
    encryptedName: z.string().min(1),
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/, "IV must be 16 base64url characters"),
    mimeType: z.string().min(1).regex(/^[\w\-]+\/[\w\-+.]+$/, "Invalid MIME type format")
        .refine(v => !/^(text\/html|application\/javascript|application\/x-javascript|text\/javascript|application\/xhtml\+xml)$/i.test(v), "This MIME type is not allowed"),
    chunkCount: z.number().int().positive().max(MAX_CHUNKS_PER_FILE),
    chunkSize: z.number().int().positive(),
};

/**
 * Schema for the API route — dropId comes from path params, not the body.
 * Used by: app/api/v1/drop/[id]/file/route.ts
 */
export const addFileApiSchema = z.object(fileFields)
    .extend({
        formFieldId: z.string().min(1).max(64).optional(),
    })
    .refine(chunkSizeValid, {
        message: "Chunk size must be at least 5MB for multi-part uploads",
        path: ["chunkSize"],
    })
    .refine(chunkConsistencyValid, {
        message: "Declared size is inconsistent with chunkCount and chunkSize",
        path: ["size"],
    })
    .refine(plaintextSizeValid, {
        message: "Plaintext file size exceeds the 250 GiB limit",
        path: ["size"],
    });

/**
 * Schema for the server action — dropId is included in the request body.
 * Used by: actions/drop.ts
 */
export const addFileActionSchema = z.object({
    dropId: z.string().min(1),
    ...fileFields,
})
    .refine(chunkSizeValid, {
        message: "Chunk size must be at least 5MB for multi-part uploads",
        path: ["chunkSize"],
    })
    .refine(chunkConsistencyValid, {
        message: "Declared size is inconsistent with chunkCount and chunkSize",
        path: ["size"],
    })
    .refine(plaintextSizeValid, {
        message: "Plaintext file size exceeds the 250 GiB limit",
        path: ["size"],
    });

/**
 * A single drop recipient. The decryption key is never sent here — the server
 * only mints an access token; the client assembles the share link with the key.
 */
export const recipientInputSchema = z.object({
    email: z.string().email().max(254),
    label: z.string().max(120).optional(),
    maxDownloads: z.number().int().positive().max(100_000).optional(),
    expiresAt: z.string().datetime().optional(),
});

/**
 * Add recipients to a drop and/or toggle "restrict downloads to named recipients".
 * Used by: actions/drop.ts and app/api/v1/drop/[id]/recipients/route.ts
 */
export const addRecipientsSchema = z.object({
    dropId: z.string().min(1),
    recipients: z.array(recipientInputSchema).max(50).default([]),
    restrict: z.boolean().optional(),
    /** Email each new recipient their keyless access link (never carries the key). */
    notify: z.boolean().optional(),
}).refine((d) => d.recipients.length > 0 || d.restrict !== undefined, {
    message: "Provide at least one recipient or change the restriction setting",
    path: ["recipients"],
});
