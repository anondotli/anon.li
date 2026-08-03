/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    requireSession: vi.fn(),
    rateLimit: vi.fn(),
    loggerError: vi.fn(),
    userFindUnique: vi.fn(),
    aliasFindMany: vi.fn(),
    domainFindMany: vi.fn(),
    dropFindMany: vi.fn(),
    formFindMany: vi.fn(),
    recipientFindMany: vi.fn(),
    apiKeyFindMany: vi.fn(),
}))

vi.mock("@/lib/api-auth", () => ({
    requireSession: mocks.requireSession,
}))

vi.mock("@/lib/rate-limit", () => ({
    rateLimit: mocks.rateLimit,
}))

vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ error: mocks.loggerError }),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique: mocks.userFindUnique },
        alias: { findMany: mocks.aliasFindMany },
        domain: { findMany: mocks.domainFindMany },
        drop: { findMany: mocks.dropFindMany },
        form: { findMany: mocks.formFindMany },
        recipient: { findMany: mocks.recipientFindMany },
        apiKey: { findMany: mocks.apiKeyFindMany },
    },
}))

const createdAt = new Date("2026-08-01T10:00:00.000Z")
const updatedAt = new Date("2026-08-01T11:00:00.000Z")

beforeEach(() => {
    vi.clearAllMocks()
    mocks.requireSession.mockResolvedValue({ userId: "user-1" })
    mocks.rateLimit.mockResolvedValue(null)
    mocks.userFindUnique.mockResolvedValue({
        id: "user-1",
        name: "Example User",
        email: "user@example.com",
        emailVerified: true,
        storageUsed: BigInt(42),
        storageLimit: BigInt(1_000),
        createdAt,
        referralPlusUntil: null,
        subscriptions: [],
    })
    mocks.aliasFindMany.mockResolvedValue([])
    mocks.domainFindMany.mockResolvedValue([])
    mocks.dropFindMany.mockResolvedValue([])
    mocks.formFindMany.mockResolvedValue([])
    mocks.recipientFindMany.mockResolvedValue([])
    mocks.apiKeyFindMany.mockResolvedValue([])
})

describe("GET /api/user/export", () => {
    it("scopes every exported resource to the user's personal workspace", async () => {
        const { GET } = await import("@/app/api/user/export/route")

        const response = await GET()

        expect(response.status).toBe(200)
        for (const findMany of [
            mocks.aliasFindMany,
            mocks.domainFindMany,
            mocks.dropFindMany,
            mocks.formFindMany,
            mocks.recipientFindMany,
            mocks.apiKeyFindMany,
        ]) {
            expect(findMany).toHaveBeenCalledWith(
                expect.objectContaining({
                    where: { userId: "user-1", organizationId: null },
                }),
            )
        }
    })

    it("serializes BigInt sizes and exposes only API-key prefixes", async () => {
        mocks.dropFindMany.mockResolvedValue([{
            id: "drop-1",
            encryptedTitle: "ciphertext",
            encryptedMessage: null,
            downloads: 1,
            maxDownloads: 2,
            expiresAt: null,
            customKey: false,
            hideBranding: false,
            deletedAt: null,
            createdAt,
            updatedAt,
            files: [{
                id: "file-1",
                encryptedName: "encrypted-name",
                size: BigInt(128),
                mimeType: "application/octet-stream",
            }],
        }])
        mocks.apiKeyFindMany.mockResolvedValue([{
            keyPrefix: "ak_public",
            label: "CLI",
            createdAt,
        }])
        mocks.formFindMany.mockResolvedValue([{
            id: "form-1",
            title: "Intake",
            description: null,
            schemaJson: "{}",
            active: true,
            disabledByUser: false,
            customKey: false,
            maxSubmissions: null,
            closesAt: null,
            hideBranding: false,
            allowFileUploads: false,
            submissionsCount: 3,
            takenDown: false,
            deletedAt: null,
            createdAt,
            updatedAt,
        }])
        const { GET } = await import("@/app/api/user/export/route")

        const response = await GET()
        const body = await response.json()

        expect(body.drops[0]).toMatchObject({
            totalSize: 128,
            files: [{ size: 128 }],
        })
        expect(body.usage).toMatchObject({ dropCount: 1, formCount: 1 })
        expect(body.forms[0]).toMatchObject({
            id: "form-1",
            createdAt: createdAt.toISOString(),
            updatedAt: updatedAt.toISOString(),
        })
        expect(body.apiKeys).toEqual([{
            prefix: "ak_public",
            label: "CLI",
            createdAt: createdAt.toISOString(),
        }])
        expect(response.headers.get("content-disposition")).toMatch(
            /^attachment; filename="anon-li-export-\d{4}-\d{2}-\d{2}\.json"$/,
        )
        expect(response.headers.get("cache-control")).toBe("private, no-store")
    })

    it("rejects unauthenticated exports before querying user data", async () => {
        mocks.requireSession.mockResolvedValue(null)
        const { GET } = await import("@/app/api/user/export/route")

        const response = await GET()

        expect(response.status).toBe(401)
        expect(mocks.userFindUnique).not.toHaveBeenCalled()
    })
})
