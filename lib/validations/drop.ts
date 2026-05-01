import { z } from "zod";

// Shared refinement validators
function chunkSizeValid(data: { chunkCount: number; chunkSize: number }) {
    if (data.chunkCount === 1) return true;
    return data.chunkSize >= 5 * 1024 * 1024; // 5MB S3 minimum for multipart
}

function chunkConsistencyValid(data: { chunkCount: number; chunkSize: number; size: number }) {
    if (data.chunkCount === 1) return true;
    const min = (data.chunkCount - 1) * data.chunkSize;
    const max = data.chunkCount * data.chunkSize;
    return data.size >= min && data.size <= max;
}

const fileFields = {
    size: z.number().int().positive().max(250 * 1024 * 1024 * 1024),
    encryptedName: z.string().min(1),
    iv: z.string().regex(/^[A-Za-z0-9_-]{16}$/, "IV must be 16 base64url characters"),
    mimeType: z.string().min(1).regex(/^[\w\-]+\/[\w\-+.]+$/, "Invalid MIME type format")
        .refine(v => !/^(text\/html|application\/javascript|application\/x-javascript|text\/javascript|application\/xhtml\+xml)$/i.test(v), "This MIME type is not allowed"),
    chunkCount: z.number().int().positive().max(10000),
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
    });
