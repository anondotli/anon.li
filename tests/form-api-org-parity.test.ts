/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

type TestContext = {
    userId: string | null
    requestId: string
    organizationId: string | null
    orgRole: "member" | "admin" | "owner" | null
    rateLimitHeaders: Headers | null
}

const context: TestContext = {
    userId: "user-1",
    requestId: "req-form-org-parity",
    organizationId: null,
    orgRole: null,
    rateLimitHeaders: null,
}

const prisma = {
    userSecurity: { findUnique: vi.fn() },
}

const listForms = vi.fn()
const createForm = vi.fn()
const countCurrentMonthSubmissions = vi.fn()
const getFormOwnerEntitlements = vi.fn()
const checkVaultIdentity = vi.fn()
const vaultIdentityErrorResponse = vi.fn()

vi.mock("@/lib/route-policy", () => ({
    withPolicy: (
        _policy: unknown,
        handler: (ctx: TestContext & { request: Request }) => Promise<Response>,
    ) => (request: Request) => handler({ ...context, request }),
    scopeFromContext: (ctx: TestContext) => ({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        role: ctx.orgRole,
    }),
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/services/form", () => ({
    FormService: { listForms, createForm, countCurrentMonthSubmissions },
}))
vi.mock("@/lib/services/form-entitlements", () => ({ getFormOwnerEntitlements }))
vi.mock("@/lib/vault/identity", () => ({ checkVaultIdentity, vaultIdentityErrorResponse }))

const VAULT_ID = "cmau000000000000000000001"

function usePersonalScope() {
    context.organizationId = null
    context.orgRole = null
}

function useOrgScope() {
    context.organizationId = "org-1"
    context.orgRole = "member"
}

function createRequest(overrides: Record<string, unknown> = {}) {
    return new Request("https://anon.li/api/v1/form", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            title: "Secure intake",
            schema: { version: 1, title: "Secure intake", fields: [] },
            publicKey: "A".repeat(87),
            wrappedPrivateKey: "A".repeat(32),
            vaultGeneration: 4,
            vaultId: VAULT_ID,
            ...overrides,
        }),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    context.userId = "user-1"
    usePersonalScope()

    prisma.userSecurity.findUnique.mockResolvedValue({ id: VAULT_ID, vaultGeneration: 4 })
    checkVaultIdentity.mockReturnValue(null)
    vaultIdentityErrorResponse.mockReturnValue(null)
    listForms.mockResolvedValue({ forms: [], total: 0 })
    countCurrentMonthSubmissions.mockResolvedValue(321)
    createForm.mockResolvedValue({
        id: "form12345678",
        title: "Secure intake",
        publicKey: "A".repeat(87),
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
    })
    getFormOwnerEntitlements.mockResolvedValue({
        limits: { forms: 30, submissionsPerMonth: 10_000, retentionDays: 365 },
        tiers: { form: "pro", drop: "pro" },
        subscribed: true,
    })
})

describe("v1 Form organization parity", () => {
    it("returns limits for the active organization scope when listing forms", async () => {
        useOrgScope()
        const { GET } = await import("@/app/api/v1/form/route")

        const response = await GET(new Request("https://anon.li/api/v1/form"))
        const body = await response.json()

        expect(response.status).toBe(200)
        expect(listForms).toHaveBeenCalledWith(
            { userId: "user-1", organizationId: "org-1", role: "member" },
            { limit: 25, offset: 0 },
        )
        expect(getFormOwnerEntitlements).toHaveBeenCalledWith({
            userId: "user-1",
            organizationId: "org-1",
            role: "member",
        })
        expect(countCurrentMonthSubmissions).toHaveBeenCalledWith({
            userId: "user-1",
            organizationId: "org-1",
            role: "member",
        })
        expect(body.meta.plan).toEqual({
            forms_limit: 30,
            submissions_per_month: 10_000,
            submissions_used_current_month: 321,
            retention_days: 365,
        })
    })

    it("requires the wrapping generation for an organization form", async () => {
        useOrgScope()
        const { POST } = await import("@/app/api/v1/form/route")

        const response = await POST(createRequest())

        expect(response.status).toBe(400)
        expect(prisma.userSecurity.findUnique).not.toHaveBeenCalled()
        expect(createForm).not.toHaveBeenCalled()
    })

    it("passes the organization wrapping generation without reading personal vault identity", async () => {
        useOrgScope()
        const { POST } = await import("@/app/api/v1/form/route")

        const response = await POST(createRequest({ orgKeyGeneration: 7 }))

        expect(response.status).toBe(200)
        expect(prisma.userSecurity.findUnique).not.toHaveBeenCalled()
        expect(checkVaultIdentity).not.toHaveBeenCalled()
        expect(createForm).toHaveBeenCalledWith(
            { userId: "user-1", organizationId: "org-1", role: "member" },
            expect.objectContaining({ orgKeyGeneration: 7 }),
        )
    })

    it("retains personal vault identity validation for personal forms", async () => {
        const { POST } = await import("@/app/api/v1/form/route")

        const response = await POST(createRequest())

        expect(response.status).toBe(200)
        expect(prisma.userSecurity.findUnique).toHaveBeenCalledWith({
            where: { userId: "user-1" },
            select: { id: true, vaultGeneration: true },
        })
        expect(checkVaultIdentity).toHaveBeenCalledWith(
            { id: VAULT_ID, vaultGeneration: 4 },
            { vaultId: VAULT_ID, vaultGeneration: 4 },
        )
        expect(createForm).toHaveBeenCalledWith(
            { userId: "user-1", organizationId: null, role: null },
            expect.not.objectContaining({ vaultId: expect.anything() }),
        )
    })
})
