/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const prisma = {
    user: {
        findUnique: vi.fn(),
    },
    alias: {
        groupBy: vi.fn(),
    },
    userSecurity: {
        findUnique: vi.fn(),
    },
    drop: {
        findUnique: vi.fn(),
    },
    dropOwnerKey: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
    },
}

const getEffectiveTier = vi.fn()
const getDisplayPlanLimits = vi.fn()
const getDropLimits = vi.fn()
const getProductFromPriceId = vi.fn()
const getVaultSchemaState = vi.fn()
const persistOwnedDropKey = vi.fn()

class DropOwnerKeyConflictError extends Error {}

const mockPolicyContext: {
    userId: string | null
    requestId: string
    user: {
        id: string
        stripeSubscriptionId: string | null
        stripePriceId: string | null
        stripeCurrentPeriodEnd: Date | null
    } | null
    apiKeyId?: string
    rateLimitHeaders: Headers | null
} = {
    userId: "user-123",
    requestId: "req-test",
    user: {
        id: "user-123",
        stripeSubscriptionId: null,
        stripePriceId: "price_plus",
        stripeCurrentPeriodEnd: null,
    },
    apiKeyId: "api-key-123",
    rateLimitHeaders: null,
}

vi.mock("@/lib/route-policy", () => ({
    withPolicy: (_policy: unknown, handler: (ctx: unknown, routeContext: unknown) => Promise<Response>) =>
        (request: Request, routeContext?: unknown) => handler({
            ...mockPolicyContext,
            request,
        }, routeContext),
}))

vi.mock("@/lib/prisma", () => ({
    prisma,
}))

vi.mock("@/lib/limits", () => ({
    getEffectiveTier,
    getDisplayPlanLimits,
    getDropLimits,
    getProductFromPriceId,
}))

vi.mock("@/config/plans", () => ({
    EXPIRY_LIMITS: {
        free: 7,
        plus: 30,
        pro: 90,
    },
}))

vi.mock("@/lib/vault/schema", () => ({
    getVaultSchemaState,
    VAULT_SCHEMA_UNAVAILABLE_MESSAGE: "Vault schema unavailable",
}))

vi.mock("@/lib/vault/drop-owner-keys", () => ({
    persistOwnedDropKey,
    DropOwnerKeyConflictError,
}))

async function readJson(response: Response) {
    return response.json() as Promise<{
        data?: Record<string, unknown> | Array<Record<string, unknown>>
        error?: { code?: string; message?: string }
    }>
}

describe("extension parity routes", () => {
    beforeEach(() => {
        vi.clearAllMocks()

        mockPolicyContext.userId = "user-123"
        mockPolicyContext.user = {
            id: "user-123",
        }

        getEffectiveTier.mockReturnValue("plus")
        getDisplayPlanLimits.mockReturnValue({
            random: 50,
            custom: 25,
            domains: 5,
            recipients: 10,
            apiRequests: 5000,
        })
        getDropLimits.mockReturnValue({
            maxStorage: BigInt(1024 * 1024 * 1024),
            maxFileSize: 250 * 1024 * 1024,
            features: {
                customKey: true,
                downloadLimits: true,
                noBranding: true,
                downloadNotifications: true,
            },
        })
        getProductFromPriceId.mockReturnValue("bundle")

        getVaultSchemaState.mockResolvedValue({
            userSecurity: true,
            dropOwnerKeys: true,
        })
        persistOwnedDropKey.mockResolvedValue(undefined)

        prisma.user.findUnique.mockResolvedValue({
            id: "user-123",
            email: "user@example.com",
            name: "Example User",
            subscriptions: [
                {
                    status: "active",
                    product: "bundle",
                    tier: "plus",
                    currentPeriodEnd: new Date(Date.now() + 30 * 86400000),
                },
            ],
            storageUsed: BigInt(512),
            createdAt: new Date("2026-04-19T00:00:00.000Z"),
            _count: {
                aliases: 5,
                drops: 2,
                domains: 1,
                recipients: 2,
            },
        })
        prisma.alias.groupBy.mockResolvedValue([
            { format: "RANDOM", _count: { _all: 3 } },
            { format: "CUSTOM", _count: { _all: 2 } },
        ])
        prisma.userSecurity.findUnique.mockResolvedValue({
            id: "cmau000000000000000000001",
            vaultGeneration: 4,
        })
        prisma.drop.findUnique.mockResolvedValue({
            userId: "user-123",
        })
        prisma.dropOwnerKey.findUnique.mockResolvedValue({
            userId: "user-123",
            dropId: "drop-123",
            wrappedKey: "wrapped-key-123456789012345678901234",
            vaultGeneration: 4,
        })
        prisma.dropOwnerKey.findMany.mockResolvedValue([
            {
                dropId: "drop-123",
                wrappedKey: "wrapped-key-123456789012345678901234",
                vaultGeneration: 4,
            },
        ])
    })

    it("includes vault_configured on /api/v1/me", async () => {
        const { GET } = await import("@/app/api/v1/me/route")

        const response = await GET(new Request("http://localhost/api/v1/me"))
        const payload = await readJson(response)

        expect(response.status).toBe(200)
        expect(payload.data).toMatchObject({
            email: "user@example.com",
            tier: "plus",
            vault_configured: true,
        })
    })

    it("lists wrapped drop keys with extension-facing field names", async () => {
        const { GET } = await import("@/app/api/v1/vault/drop-keys/route")

        const response = await GET(new Request("http://localhost/api/v1/vault/drop-keys"))
        const payload = await readJson(response)

        expect(response.status).toBe(200)
        expect(payload.data).toEqual([
            {
                drop_id: "drop-123",
                wrapped_key: "wrapped-key-123456789012345678901234",
                vault_generation: 4,
            },
        ])
    })

    it("rejects access to another user's wrapped drop key", async () => {
        prisma.dropOwnerKey.findUnique.mockResolvedValueOnce({
            userId: "other-user",
            dropId: "drop-123",
            wrappedKey: "wrapped-key-123456789012345678901234",
            vaultGeneration: 4,
        })

        const { GET } = await import("@/app/api/v1/vault/drop-keys/route")
        const response = await GET(new Request("http://localhost/api/v1/vault/drop-keys?drop_id=drop-123"))
        const payload = await readJson(response)

        expect(response.status).toBe(404)
        expect(payload.error?.code).toBe("NOT_FOUND")
    })

    it("stores wrapped drop keys for the authenticated owner", async () => {
        const { POST } = await import("@/app/api/v1/vault/drop-keys/route")
        const response = await POST(new Request("http://localhost/api/v1/vault/drop-keys", {
            method: "POST",
            body: JSON.stringify({
                drop_id: "drop-123",
                wrapped_key: "wrapped-key-123456789012345678901234",
                vault_id: "cmau000000000000000000001",
                vault_generation: 4,
            }),
        }))
        const payload = await readJson(response)

        expect(response.status).toBe(200)
        expect(persistOwnedDropKey).toHaveBeenCalledWith(
            prisma,
            "user-123",
            "drop-123",
            "wrapped-key-123456789012345678901234",
            4,
        )
        expect(payload.data).toEqual({
            drop_id: "drop-123",
            vault_generation: 4,
        })
    })

    it("rejects wrapped drop key writes with a mismatched vault generation", async () => {
        const { POST } = await import("@/app/api/v1/vault/drop-keys/route")
        const response = await POST(new Request("http://localhost/api/v1/vault/drop-keys", {
            method: "POST",
            body: JSON.stringify({
                drop_id: "drop-123",
                wrapped_key: "wrapped-key-123456789012345678901234",
                vault_id: "cmau000000000000000000001",
                vault_generation: 3,
            }),
        }))
        const payload = await readJson(response)

        expect(response.status).toBe(409)
        expect(payload.error?.code).toBe("CONFLICT")
        expect(persistOwnedDropKey).not.toHaveBeenCalled()
    })
})
