/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type TestContext = {
    userId: string | null
    requestId: string
    apiKeyId?: string
    organizationId: string | null
    orgRole: "member" | "admin" | "owner" | null
    user: { id: string; subscriptions: [] } | null
    rateLimitHeaders: Headers | null
}

const context: TestContext = {
    userId: "user-1",
    requestId: "req-tenancy",
    apiKeyId: "key-1",
    organizationId: null,
    orgRole: null,
    user: { id: "user-1", subscriptions: [] },
    rateLimitHeaders: null,
}

const prisma = {
    user: { findUnique: vi.fn() },
    subscription: { findFirst: vi.fn() },
    alias: { groupBy: vi.fn() },
    userSecurity: { findUnique: vi.fn() },
    organization: { findUnique: vi.fn() },
    drop: { findFirst: vi.fn(), deleteMany: vi.fn() },
    dropOwnerKey: { findFirst: vi.fn(), findMany: vi.fn() },
}

const createDrop = vi.fn()
const persistOwnedDropKey = vi.fn()
const verifyCredentialSecret = vi.fn()
const getUserBillingState = vi.fn()
const createCheckoutSession = vi.fn()

class DropOwnerKeyConflictError extends Error {}

vi.mock("@/lib/route-policy", () => ({
    withPolicy: (
        _policy: unknown,
        handler: (ctx: TestContext & { request: Request }, routeContext?: unknown) => Promise<Response>,
    ) => (request: Request, routeContext?: unknown) => handler({ ...context, request }, routeContext),
    scopeFromContext: (ctx: TestContext) => ({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        role: ctx.orgRole,
    }),
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/services/drop", () => ({
    DropService: {
        createDrop,
        listDrops: vi.fn(),
    },
}))
vi.mock("@/lib/vault/drop-owner-keys", () => ({
    DropOwnerKeyConflictError,
    persistOwnedDropKey,
}))
vi.mock("@/lib/vault/server", () => ({ verifyCredentialSecret }))
vi.mock("@/lib/services/drop-upload-token", () => ({ issueUploadToken: vi.fn() }))
vi.mock("@/lib/turnstile", () => ({ getTurnstileError: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({
    checkRateLimit: vi.fn(),
    getClientIp: vi.fn(),
    rateLimiters: {},
}))
vi.mock("@/lib/limits", () => ({
    getDropLimits: vi.fn(),
    getEffectiveTier: vi.fn(),
    getDisplayPlanLimits: vi.fn(),
}))
vi.mock("@/lib/data/user", () => ({ getUserBillingState }))
vi.mock("@/lib/stripe-prices", () => ({ getStripePriceId: vi.fn(() => "price-1") }))
vi.mock("@/lib/stripe", () => ({
    stripe: {
        promotionCodes: { list: vi.fn() },
        checkout: { sessions: { create: createCheckoutSession } },
    },
}))

const VAULT_ID = "cmau000000000000000000001"
const WRAPPED_KEY = "wrapped-key-123456789012345678901234"

function usePersonalScope() {
    context.organizationId = null
    context.orgRole = null
}

function useOrgScope() {
    context.organizationId = "org-1"
    context.orgRole = "member"
}

function dropKeyRequest() {
    return new Request("https://anon.li/api/v1/vault/drop-keys", {
        method: "POST",
        body: JSON.stringify({
            drop_id: "drop-1",
            wrapped_key: WRAPPED_KEY,
            vault_id: VAULT_ID,
            vault_generation: 4,
        }),
    })
}

function createDropRequest() {
    return new Request("https://anon.li/api/v1/drop", {
        method: "POST",
        body: JSON.stringify({
            iv: "AAAAAAAAAAAAAAAA",
            ownerKey: {
                wrappedKey: WRAPPED_KEY,
                vaultId: VAULT_ID,
                vaultGeneration: 4,
            },
        }),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    context.userId = "user-1"
    context.apiKeyId = "key-1"
    context.user = { id: "user-1", subscriptions: [] }
    usePersonalScope()

    prisma.userSecurity.findUnique.mockResolvedValue({ id: VAULT_ID, vaultGeneration: 4 })
    prisma.organization.findUnique.mockResolvedValue({ orgKeyGeneration: 7 })
    prisma.drop.findFirst.mockResolvedValue({ id: "drop-1" })
    prisma.drop.deleteMany.mockResolvedValue({ count: 1 })
    prisma.dropOwnerKey.findMany.mockResolvedValue([])
    prisma.subscription.findFirst.mockResolvedValue(null)
    createDrop.mockResolvedValue({ dropId: "drop-1", expiresAt: null })
    persistOwnedDropKey.mockResolvedValue(undefined)
    verifyCredentialSecret.mockResolvedValue(true)
    getUserBillingState.mockResolvedValue({ email: "user@example.com", stripeCustomerId: null })
    createCheckoutSession.mockResolvedValue({ url: "https://checkout.example/session" })
})

describe("v1 drop-owner-key tenancy", () => {
    it("keeps personal and organization key lists in separate scopes", async () => {
        const { GET } = await import("@/app/api/v1/vault/drop-keys/route")

        await GET(new Request("https://anon.li/api/v1/vault/drop-keys"))
        expect(prisma.dropOwnerKey.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
            where: {
                userId: "user-1",
                organizationId: null,
                drop: { userId: "user-1", organizationId: null },
            },
        }))

        useOrgScope()
        await GET(new Request("https://anon.li/api/v1/vault/drop-keys"))
        expect(prisma.dropOwnerKey.findMany).toHaveBeenLastCalledWith(expect.objectContaining({
            where: {
                organizationId: "org-1",
                drop: { organizationId: "org-1" },
            },
        }))
    })

    it("rejects an organization write aimed outside the active organization", async () => {
        useOrgScope()
        prisma.drop.findFirst.mockResolvedValueOnce(null)
        const { POST } = await import("@/app/api/v1/vault/drop-keys/route")

        const response = await POST(dropKeyRequest())

        expect(response.status).toBe(404)
        expect(prisma.drop.findFirst).toHaveBeenCalledWith({
            where: { id: "drop-1", organizationId: "org-1" },
            select: { id: true },
        })
        expect(persistOwnedDropKey).not.toHaveBeenCalled()
    })

    it("stamps an organization key write with the server's current generation", async () => {
        useOrgScope()
        const { POST } = await import("@/app/api/v1/vault/drop-keys/route")

        const response = await POST(dropKeyRequest())

        expect(response.status).toBe(200)
        expect(prisma.userSecurity.findUnique).not.toHaveBeenCalled()
        expect(persistOwnedDropKey).toHaveBeenCalledWith(
            prisma,
            "user-1",
            "drop-1",
            WRAPPED_KEY,
            4,
            { organizationId: "org-1", orgKeyGeneration: 7 },
        )
    })

    it("keeps personal key writes explicitly personal", async () => {
        const { POST } = await import("@/app/api/v1/vault/drop-keys/route")

        const response = await POST(dropKeyRequest())

        expect(response.status).toBe(200)
        expect(prisma.drop.findFirst).toHaveBeenCalledWith({
            where: { id: "drop-1", userId: "user-1", organizationId: null },
            select: { id: true },
        })
        expect(persistOwnedDropKey).toHaveBeenCalledWith(
            prisma,
            "user-1",
            "drop-1",
            WRAPPED_KEY,
            4,
            undefined,
        )
    })

    it("binds owner-key persistence during organization drop creation", async () => {
        useOrgScope()
        const { POST } = await import("@/app/api/v1/drop/route")

        const response = await POST(createDropRequest())

        expect(response.status).toBe(200)
        expect(prisma.userSecurity.findUnique).not.toHaveBeenCalled()
        expect(createDrop).toHaveBeenCalledWith(
            { userId: "user-1", organizationId: "org-1", role: "member" },
            expect.objectContaining({ iv: "AAAAAAAAAAAAAAAA" }),
        )
        expect(persistOwnedDropKey).toHaveBeenCalledWith(
            prisma,
            "user-1",
            "drop-1",
            WRAPPED_KEY,
            4,
            { organizationId: "org-1", orgKeyGeneration: 7 },
        )
    })

    it("retains personal vault validation during personal drop creation", async () => {
        const { POST } = await import("@/app/api/v1/drop/route")

        const response = await POST(createDropRequest())

        expect(response.status).toBe(200)
        expect(prisma.userSecurity.findUnique).toHaveBeenCalledWith({
            where: { userId: "user-1" },
            select: { id: true, vaultGeneration: true },
        })
        expect(prisma.organization.findUnique).not.toHaveBeenCalled()
        expect(persistOwnedDropKey).toHaveBeenCalledWith(
            prisma,
            "user-1",
            "drop-1",
            WRAPPED_KEY,
            4,
            undefined,
        )
    })
})

describe("personal-only v1 endpoints", () => {
    it("rejects organization API keys before reading personal data or starting checkout", async () => {
        useOrgScope()
        const [{ POST: unlock }, { GET: me }, { POST: checkout }] = await Promise.all([
            import("@/app/api/v1/vault/unlock/route"),
            import("@/app/api/v1/me/route"),
            import("@/app/api/v1/checkout/route"),
        ])

        const [unlockResponse, meResponse, checkoutResponse] = await Promise.all([
            unlock(new Request("https://anon.li/api/v1/vault/unlock", { method: "POST" })),
            me(new Request("https://anon.li/api/v1/me")),
            checkout(new Request("https://anon.li/api/v1/checkout", { method: "POST" })),
        ])

        expect(unlockResponse.status).toBe(403)
        expect(meResponse.status).toBe(403)
        expect(checkoutResponse.status).toBe(403)
        expect(prisma.userSecurity.findUnique).not.toHaveBeenCalled()
        expect(prisma.user.findUnique).not.toHaveBeenCalled()
        expect(getUserBillingState).not.toHaveBeenCalled()
        expect(createCheckoutSession).not.toHaveBeenCalled()
        expect(verifyCredentialSecret).not.toHaveBeenCalled()
    })

    it("keeps personal checkout behavior available", async () => {
        const { POST } = await import("@/app/api/v1/checkout/route")
        const response = await POST(new Request("https://anon.li/api/v1/checkout", {
            method: "POST",
            body: JSON.stringify({ product: "drop", tier: "plus", frequency: "monthly" }),
        }))

        expect(response.status).toBe(200)
        expect(prisma.subscription.findFirst).toHaveBeenCalledWith({
            where: {
                userId: "user-1",
                organizationId: null,
                status: { in: ["active", "trialing"] },
                currentPeriodEnd: { gt: expect.any(Date) },
            },
            select: { id: true },
        })
        expect(createCheckoutSession).toHaveBeenCalledOnce()
    })

    it("does not create a second personal subscription", async () => {
        prisma.subscription.findFirst.mockResolvedValueOnce({ id: "sub-1" })
        const { POST } = await import("@/app/api/v1/checkout/route")

        const response = await POST(new Request("https://anon.li/api/v1/checkout", {
            method: "POST",
            body: JSON.stringify({ product: "drop", tier: "plus", frequency: "monthly" }),
        }))

        expect(response.status).toBe(409)
        expect(getUserBillingState).not.toHaveBeenCalled()
        expect(createCheckoutSession).not.toHaveBeenCalled()
    })
})
