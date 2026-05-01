"use client"

import { pMapLimit } from "@/lib/async-utils"
import { CryptoConfig, calculateEncryptedSize, cryptoService } from "@/lib/crypto.client"
import { uploadChunk } from "@/lib/drop.client"

export type SelectedFormFile = {
    fieldId: string
    fieldLabel: string
    file: File
}

export type UploadedFormFile = {
    fieldId: string
    fieldLabel: string
    fileId: string
    originalName: string
    originalSize: number
    encryptedSize: number
    mimeType: string
}

export type FormAttachmentProgress = {
    phase: "preparing" | "encrypting" | "uploading" | "finalizing"
    currentFileName: string
    currentFileIndex: number
    totalFiles: number
    uploadedChunks: number
    totalChunks: number
}

type FormUploadTokenResponse = {
    data?: {
        drop_id: string
        upload_token: string | null
        expires_at: string | null
    }
    error?: { message?: string } | string
}

type AddFileResponse = {
    fileId: string
    s3UploadId: string
    uploadUrls: Record<number, string>
    error?: string
}

export type FormAttachmentUploadResult = {
    dropId: string
    uploadToken: string
    keyString: string
    files: UploadedFormFile[]
}

export async function uploadFormAttachments({
    formId,
    files,
    turnstileToken,
    customKeyProof,
    signal,
    onProgress,
}: {
    formId: string
    files: SelectedFormFile[]
    turnstileToken?: string | null
    customKeyProof?: string | null
    signal: AbortSignal
    onProgress?: (progress: FormAttachmentProgress) => void
}): Promise<FormAttachmentUploadResult> {
    if (files.length === 0) throw new Error("No files selected")

    const encryptionContext = await cryptoService.createEncryptionContext()
    const { keyString, dropIvString, key } = encryptionContext

    onProgress?.({
        phase: "preparing",
        currentFileName: files[0]?.file.name ?? "",
        currentFileIndex: 0,
        totalFiles: files.length,
        uploadedChunks: 0,
        totalChunks: 0,
    })

    const tokenResponse = await fetch(`/api/v1/form/${formId}/upload-token`, {
        method: "POST",
        credentials: "omit",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            iv: dropIvString,
            files: files.map(({ fieldId, file }) => ({
                fieldId,
                size: file.size,
                mimeType: file.type || "application/octet-stream",
            })),
            ...(turnstileToken ? { turnstileToken } : {}),
            ...(customKeyProof ? { customKeyProof } : {}),
        }),
        signal,
    })

    if (!tokenResponse.ok) {
        const body = await tokenResponse.json().catch(() => ({}))
        throw new Error(readErrorMessage(body, `Unable to prepare file upload (${tokenResponse.status})`))
    }

    const tokenBody = (await tokenResponse.json()) as FormUploadTokenResponse
    const dropId = tokenBody.data?.drop_id
    const uploadToken = tokenBody.data?.upload_token
    if (!dropId || !uploadToken) throw new Error("Server did not return a form upload token")

    const totalChunks = files.reduce((sum, { file }) => sum + CryptoConfig.getChunkParams(file.size).chunkCount, 0)
    let uploadedChunks = 0
    const activeUploads: { fileId: string; s3UploadId: string }[] = []
    const uploadedFiles: UploadedFormFile[] = []
    const finishRecords: { fileId: string; chunks: { chunkIndex: number; etag: string }[] }[] = []

    try {
        for (let fileIndex = 0; fileIndex < files.length; fileIndex++) {
            const entry = files[fileIndex]
            if (!entry) continue

            const file = entry.file
            const { chunkSize, chunkCount } = CryptoConfig.getChunkParams(file.size)
            const encryptedSize = calculateEncryptedSize(file.size, chunkSize)
            const fileIvString = cryptoService.generateFileIv()
            const fileIv = new Uint8Array(cryptoService.base64UrlToArrayBuffer(fileIvString))
            const encryptedName = await cryptoService.encryptFilename(file.name, key, fileIv)
            const mimeType = file.type || "application/octet-stream"

            onProgress?.({
                phase: "encrypting",
                currentFileName: file.name,
                currentFileIndex: fileIndex,
                totalFiles: files.length,
                uploadedChunks,
                totalChunks,
            })

            const added = await addFileToFormDrop(dropId, uploadToken, {
                formFieldId: entry.fieldId,
                size: encryptedSize,
                encryptedName,
                iv: fileIvString,
                mimeType,
                chunkCount,
                chunkSize,
            }, signal)

            activeUploads.push({ fileId: added.fileId, s3UploadId: added.s3UploadId })

            onProgress?.({
                phase: "uploading",
                currentFileName: file.name,
                currentFileIndex: fileIndex,
                totalFiles: files.length,
                uploadedChunks,
                totalChunks,
            })

            const chunkIndexes = Array.from({ length: chunkCount }, (_, index) => index)
            const chunks = await pMapLimit(chunkIndexes, CryptoConfig.getConcurrency(file.size), async (chunkIndex) => {
                if (signal.aborted) throw new Error("Upload cancelled")

                const start = chunkIndex * chunkSize
                const end = Math.min(start + chunkSize, file.size)
                const chunkData = await file.slice(start, end).arrayBuffer()
                const encryptedChunkData = await cryptoService.encryptChunk(chunkData, key, fileIv, chunkIndex)
                const presignedUrl = added.uploadUrls[chunkIndex + 1]
                if (!presignedUrl) throw new Error(`Missing upload URL for chunk ${chunkIndex + 1}`)

                const etag = await uploadChunk(presignedUrl, encryptedChunkData, signal)
                uploadedChunks++
                onProgress?.({
                    phase: "uploading",
                    currentFileName: file.name,
                    currentFileIndex: fileIndex,
                    totalFiles: files.length,
                    uploadedChunks,
                    totalChunks,
                })
                return { chunkIndex, etag }
            })

            finishRecords.push({ fileId: added.fileId, chunks })
            uploadedFiles.push({
                fieldId: entry.fieldId,
                fieldLabel: entry.fieldLabel,
                fileId: added.fileId,
                originalName: file.name,
                originalSize: file.size,
                encryptedSize,
                mimeType,
            })
        }

        onProgress?.({
            phase: "finalizing",
            currentFileName: files.at(-1)?.file.name ?? "",
            currentFileIndex: Math.max(0, files.length - 1),
            totalFiles: files.length,
            uploadedChunks,
            totalChunks,
        })
        await finishFormDrop(dropId, uploadToken, finishRecords, signal)

        return { dropId, uploadToken, keyString, files: uploadedFiles }
    } catch (error) {
        await Promise.allSettled(
            activeUploads.map((upload) => abortFormFileUpload(dropId, uploadToken, upload.fileId, upload.s3UploadId)),
        )
        throw error
    }
}

async function addFileToFormDrop(
    dropId: string,
    uploadToken: string,
    input: {
        size: number
        formFieldId: string
        encryptedName: string
        iv: string
        mimeType: string
        chunkCount: number
        chunkSize: number
    },
    signal: AbortSignal,
): Promise<AddFileResponse> {
    const response = await fetch(`/api/v1/drop/${dropId}/file`, {
        method: "POST",
        credentials: "omit",
        headers: {
            "Content-Type": "application/json",
            "X-Upload-Token": uploadToken,
        },
        body: JSON.stringify(input),
        signal,
    })
    const body = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(readErrorMessage(body, `Unable to upload file (${response.status})`))
    return body as AddFileResponse
}

async function finishFormDrop(
    dropId: string,
    uploadToken: string,
    files: { fileId: string; chunks: { chunkIndex: number; etag: string }[] }[],
    signal: AbortSignal,
): Promise<void> {
    const response = await fetch(`/api/v1/drop/${dropId}?action=finish`, {
        method: "PATCH",
        credentials: "omit",
        headers: {
            "Content-Type": "application/json",
            "X-Upload-Token": uploadToken,
        },
        body: JSON.stringify({ files }),
        signal,
    })
    if (!response.ok) {
        const body = await response.json().catch(() => ({}))
        throw new Error(readErrorMessage(body, `Unable to finalize file upload (${response.status})`))
    }
}

async function abortFormFileUpload(
    dropId: string,
    uploadToken: string,
    fileId: string,
    s3UploadId: string,
): Promise<void> {
    await fetch(`/api/v1/drop/${dropId}/file/${fileId}`, {
        method: "DELETE",
        credentials: "omit",
        headers: {
            "Content-Type": "application/json",
            "X-Upload-Token": uploadToken,
        },
        body: JSON.stringify({ s3UploadId }),
    }).catch(() => undefined)
}

function readErrorMessage(body: unknown, fallback: string): string {
    if (body && typeof body === "object") {
        const maybe = body as { error?: { message?: string } | string }
        if (typeof maybe.error === "string") return maybe.error
        if (maybe.error?.message) return maybe.error.message
    }
    return fallback
}
