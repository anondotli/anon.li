/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const getVaultSession = vi.fn()
const enforceVaultRequestGuards = vi.fn()
const persistOwnedFormKey = vi.fn()

const prisma = {
    userSecurity: { findUnique: vi.fn() },
    form: { findFirst: vi.fn() },
    formOwnerKey: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
    },
}

class FormOwnerKeyConflictError extends Error {}

vi.mock("@/lib/prisma", () => ({ prisma }))

vi.mock("@/lib/vault/server", () => ({ getVaultSession }))

vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))

vi.mock("@/lib/vault/form-owner-keys", () => ({
    FormOwnerKeyConflictError,
    persistOwnedFormKey,
}))

vi.mock("@/lib/vault/org-access", () => ({
    getMemberOrgIds: vi.fn(),
    isOrgMember: vi.fn(),
}))

vi.mock("@/lib/vault/api", () => ({
    logVaultError: vi.fn(),
    logVaultWarn: vi.fn(),
}))

const vaultId = "cmau000000000000000000001"

function formKeyRequest(formId: string) {
    return new Request("http://localhost/api/vault/form-keys", {
        method: "POST",
        body: JSON.stringify({
            formId,
            wrappedKey: "e".repeat(32),
            vaultId,
            vaultGeneration: 3,
        }),
    })
}

beforeEach(() => {
    vi.clearAllMocks()
    getVaultSession.mockResolvedValue({ user: { id: "user-1" } })
    enforceVaultRequestGuards.mockResolvedValue(null)
    prisma.userSecurity.findUnique.mockResolvedValue({ id: vaultId, vaultGeneration: 3 })
    prisma.form.findFirst.mockResolvedValue({ id: "form-1" })
    persistOwnedFormKey.mockResolvedValue(undefined)
})

describe("legacy form-key write scope", () => {
    it("stores a key only after resolving a personal form in the active user scope", async () => {
        const { POST } = await import("@/app/api/vault/form-keys/route")

        const response = await POST(formKeyRequest("form-1"))

        expect(response.status).toBe(200)
        expect(prisma.form.findFirst).toHaveBeenCalledWith({
            where: {
                id: "form-1",
                userId: "user-1",
                organizationId: null,
            },
            select: { id: true },
        })
        expect(persistOwnedFormKey).toHaveBeenCalledWith(
            prisma,
            "user-1",
            "form-1",
            "e".repeat(32),
            3,
        )
    })

    it("rejects an organization form created by the same user", async () => {
        prisma.form.findFirst.mockResolvedValueOnce(null)
        const { POST } = await import("@/app/api/vault/form-keys/route")

        const response = await POST(formKeyRequest("org-form"))

        expect(response.status).toBe(404)
        expect(prisma.form.findFirst).toHaveBeenCalledWith({
            where: {
                id: "org-form",
                userId: "user-1",
                organizationId: null,
            },
            select: { id: true },
        })
        expect(persistOwnedFormKey).not.toHaveBeenCalled()
    })
})
