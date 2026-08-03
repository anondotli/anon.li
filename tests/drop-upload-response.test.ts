import { describe, expect, it } from "vitest"

import {
    parseProvisionedFileResponse,
    parseUploadTargetResponse,
} from "@/lib/drop-upload-response.client"

describe("drop upload response validation", () => {
    it("accepts exact capability and multipart response shapes", () => {
        expect(parseUploadTargetResponse({
            data: {
                drop_id: "drop-1",
                upload_token: "A".repeat(43),
                expires_at: "2026-08-01T12:00:00.000Z",
                owner_key_stored: false,
            },
            meta: { request_id: "req-1" },
        })).toEqual({
            dropId: "drop-1",
            uploadToken: "A".repeat(43),
            expiresAt: "2026-08-01T12:00:00.000Z",
        })

        expect(parseProvisionedFileResponse({
            fileId: "file-1",
            s3UploadId: "multipart-1",
            uploadUrls: {
                1: "https://storage.example/part/1?signature=one",
                2: "https://storage.example/part/2?signature=two",
            },
        }, 2)).toEqual({
            fileId: "file-1",
            s3UploadId: "multipart-1",
            uploadUrls: {
                1: "https://storage.example/part/1?signature=one",
                2: "https://storage.example/part/2?signature=two",
            },
        })
    })

    it("rejects malformed capabilities and incomplete multipart URLs", () => {
        expect(() => parseUploadTargetResponse({
            data: { drop_id: "drop-1", upload_token: "short", expires_at: null },
        })).toThrow("invalid upload token response")

        expect(() => parseProvisionedFileResponse({
            fileId: "file-1",
            s3UploadId: "multipart-1",
            uploadUrls: { 1: "https://storage.example/part/1" },
        }, 2)).toThrow("incomplete file upload response")
    })

    it("rejects active-content and insecure remote upload URLs", () => {
        expect(() => parseProvisionedFileResponse({
            fileId: "file-1",
            s3UploadId: "multipart-1",
            uploadUrls: { 1: "javascript:alert(1)" },
        }, 1)).toThrow("unsafe file upload URL")

        expect(() => parseProvisionedFileResponse({
            fileId: "file-1",
            s3UploadId: "multipart-1",
            uploadUrls: { 1: "http://storage.example/part/1" },
        }, 1)).toThrow("unsafe file upload URL")

        expect(parseProvisionedFileResponse({
            fileId: "file-1",
            s3UploadId: "multipart-1",
            uploadUrls: { 1: "http://localhost:9000/part/1" },
        }, 1).uploadUrls[1]).toBe("http://localhost:9000/part/1")
    })
})
