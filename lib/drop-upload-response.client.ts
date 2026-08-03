"use client"

import { z } from "zod"
import { MAX_CHUNKS_PER_FILE } from "@/lib/constants"

const identifierSchema = z.string().min(1).max(2_048)
const uploadTokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/)

const uploadTargetResponseSchema = z.object({
    data: z.object({
        drop_id: z.string().min(1).max(64),
        upload_token: uploadTokenSchema,
        expires_at: z.iso.datetime().nullable(),
    }).passthrough(),
}).passthrough()

const provisionedFileResponseSchema = z.object({
    fileId: z.string().min(1).max(64),
    s3UploadId: identifierSchema,
    uploadUrls: z.record(z.string(), z.string().min(1).max(16_384)),
}).strict()

export interface UploadTargetResponse {
    dropId: string
    uploadToken: string
    expiresAt: string | null
}

export interface ProvisionedFileResponse {
    fileId: string
    s3UploadId: string
    uploadUrls: Record<number, string>
}

export function parseUploadTargetResponse(payload: unknown): UploadTargetResponse {
    const parsed = uploadTargetResponseSchema.safeParse(payload)
    if (!parsed.success) throw new Error("Server returned an invalid upload token response")

    return {
        dropId: parsed.data.data.drop_id,
        uploadToken: parsed.data.data.upload_token,
        expiresAt: parsed.data.data.expires_at,
    }
}

export function parseProvisionedFileResponse(
    payload: unknown,
    expectedChunkCount: number,
): ProvisionedFileResponse {
    if (
        !Number.isSafeInteger(expectedChunkCount)
        || expectedChunkCount < 1
        || expectedChunkCount > MAX_CHUNKS_PER_FILE
    ) {
        throw new Error("Invalid expected upload chunk count")
    }

    const parsed = provisionedFileResponseSchema.safeParse(payload)
    if (!parsed.success) throw new Error("Server returned an invalid file upload response")

    const entries = Object.entries(parsed.data.uploadUrls)
    if (entries.length !== expectedChunkCount) {
        throw new Error("Server returned an incomplete file upload response")
    }

    const uploadUrls: Record<number, string> = {}
    for (const [rawPartNumber, rawUrl] of entries) {
        const partNumber = Number(rawPartNumber)
        if (!Number.isSafeInteger(partNumber) || partNumber < 1 || partNumber > expectedChunkCount) {
            throw new Error("Server returned an invalid file upload response")
        }

        let url: URL
        try {
            url = new URL(rawUrl)
        } catch {
            throw new Error("Server returned an invalid file upload response")
        }
        const isLocalHttp = url.protocol === "http:"
            && (url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]")
        if (url.protocol !== "https:" && !isLocalHttp) {
            throw new Error("Server returned an unsafe file upload URL")
        }
        uploadUrls[partNumber] = url.toString()
    }

    for (let partNumber = 1; partNumber <= expectedChunkCount; partNumber++) {
        if (!uploadUrls[partNumber]) {
            throw new Error("Server returned an incomplete file upload response")
        }
    }

    return {
        fileId: parsed.data.fileId,
        s3UploadId: parsed.data.s3UploadId,
        uploadUrls,
    }
}
