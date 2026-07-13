/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const findDrop = vi.fn()
const resolveDownloadAccess = vi.fn()
const consumeDownload = vi.fn()
const recordAccessEvent = vi.fn()
const getPresignedDownloadUrl = vi.fn()

interface TestRouteContext {
    params: Promise<{ id: string }>
}

interface TestPolicyContext {
    request: Request
}

type TestHandler = (
    context: TestPolicyContext,
    routeContext: TestRouteContext,
) => Promise<Response>

vi.mock("@/lib/route-policy", () => ({
    withPolicy: (_policy: unknown, handler: TestHandler) => (
        request: Request,
        routeContext: TestRouteContext,
    ) => handler({ request }, routeContext),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        drop: { findUnique: findDrop },
    },
}))

vi.mock("@/lib/services/drop", () => ({
    DropService: { consumeDownload },
}))

vi.mock("@/lib/services/drop-recipient", () => ({
    resolveDownloadAccess,
    recordAccessEvent,
}))

vi.mock("@/lib/storage", () => ({
    getPresignedDownloadUrl,
    LIMITED_DROP_PRESIGNED_URL_EXPIRES: 120,
}))

vi.mock("@/lib/rate-limit", () => ({
    getClientIp: vi.fn().mockResolvedValue("127.0.0.1"),
}))

const availableDrop = {
    id: "drop-123",
    disabled: false,
    takenDown: false,
    deletedAt: null,
    uploadComplete: true,
    expiresAt: null,
    maxDownloads: 3,
    downloads: 0,
    restrictToRecipients: true,
    files: [
        { id: "file-1", storageKey: "d/fi/file-1" },
        { id: "file-2", storageKey: "d/fi/file-2" },
    ],
}

describe("POST /api/v1/drop/[id]/download", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        findDrop.mockResolvedValue(availableDrop)
        resolveDownloadAccess.mockResolvedValue({ allowed: true, recipientId: "recipient-123" })
        consumeDownload.mockResolvedValue(true)
        getPresignedDownloadUrl.mockImplementation(async (key: string) => `https://r2.example/${key}`)
    })

    it("presigns the entire batch before atomically consuming allowances", async () => {
        const { POST } = await import("./route")
        const response = await POST(
            new Request("http://localhost/api/v1/drop/drop-123/download", {
                method: "POST",
                headers: { "X-Drop-Recipient": "recipient-secret" },
            }),
            { params: Promise.resolve({ id: "drop-123" }) },
        )

        expect(response.status).toBe(200)
        expect(getPresignedDownloadUrl).toHaveBeenCalledTimes(2)
        expect(consumeDownload).toHaveBeenCalledWith("drop-123", "recipient-123")
        expect(getPresignedDownloadUrl.mock.invocationCallOrder[1]).toBeLessThan(
            consumeDownload.mock.invocationCallOrder[0]!,
        )
    })

    it("consumes neither allowance when any presign fails", async () => {
        const { POST } = await import("./route")
        getPresignedDownloadUrl
            .mockResolvedValueOnce("https://r2.example/d/fi/file-1")
            .mockRejectedValueOnce(new Error("R2 signing failed"))

        await expect(POST(
            new Request("http://localhost/api/v1/drop/drop-123/download", {
                method: "POST",
                headers: { "X-Drop-Recipient": "recipient-secret" },
            }),
            { params: Promise.resolve({ id: "drop-123" }) },
        )).rejects.toThrow("R2 signing failed")

        expect(consumeDownload).not.toHaveBeenCalled()
    })

    it("does not disclose already-presigned URLs when the atomic cap check fails", async () => {
        const { POST } = await import("./route")
        consumeDownload.mockResolvedValue(false)

        const response = await POST(
            new Request("http://localhost/api/v1/drop/drop-123/download", {
                method: "POST",
                headers: { "X-Drop-Recipient": "recipient-secret" },
            }),
            { params: Promise.resolve({ id: "drop-123" }) },
        )

        expect(response.status).toBe(404)
        const body = await response.json() as Record<string, unknown>
        expect(body.downloadUrls).toBeUndefined()
    })

    it("still records download statistics for an unlimited anonymous drop", async () => {
        const { POST } = await import("./route")
        findDrop.mockResolvedValue({
            ...availableDrop,
            maxDownloads: null,
            restrictToRecipients: false,
        })
        resolveDownloadAccess.mockResolvedValue({ allowed: true, recipientId: null })

        const response = await POST(
            new Request("http://localhost/api/v1/drop/drop-123/download", { method: "POST" }),
            { params: Promise.resolve({ id: "drop-123" }) },
        )

        expect(response.status).toBe(200)
        expect(consumeDownload).toHaveBeenCalledWith("drop-123", null)
        expect(getPresignedDownloadUrl).toHaveBeenCalledWith("d/fi/file-1", undefined)
    })
})
