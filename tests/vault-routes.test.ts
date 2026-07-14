/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

import { apiError, ErrorCodes } from "@/lib/api-response"

const getClientIp = vi.fn()
const rateLimit = vi.fn()
const getVaultSession = vi.fn()
const getCredentialAccount = vi.fn()
const hashCredentialSecret = vi.fn()
const verifyCredentialSecret = vi.fn()
const createFakeAuthSalt = vi.fn()
const normalizeEmail = vi.fn()
const enforceVaultRequestGuards = vi.fn()
const persistOwnedDropKey = vi.fn()

const prisma = {
    user: {
        findUnique: vi.fn(),
    },
    userSecurity: {
        findUnique: vi.fn(),
    },
    drop: {
        findFirst: vi.fn(),
    },
    dropOwnerKey: {
        findUnique: vi.fn(),
        findMany: vi.fn(),
    },
    $transaction: vi.fn(),
}

class DropOwnerKeyConflictError extends Error {}

vi.mock("@/lib/rate-limit", () => ({
    getClientIp,
    rateLimit,
    rateLimiters: {},
}))

vi.mock("@/lib/prisma", () => ({
    prisma,
}))

vi.mock("@/lib/vault/server", () => ({
    getVaultSession,
    getCredentialAccount,
    hashCredentialSecret,
    verifyCredentialSecret,
    createFakeAuthSalt,
    normalizeEmail,
    VAULT_KDF_VERSION: 1,
}))

vi.mock("@/lib/vault/http", () => ({
    enforceVaultRequestGuards,
}))

vi.mock("@/lib/vault/drop-owner-keys", () => ({
    persistOwnedDropKey,
    DropOwnerKeyConflictError,
}))

function makeSession(overrides?: Partial<{
    userId: string
    twoFactorEnabled: boolean
    twoFactorVerified: boolean
    sessionId: string
}>) {
    return {
        user: {
            id: overrides?.userId ?? "user-123",
            twoFactorEnabled: overrides?.twoFactorEnabled ?? false,
        },
        session: {
            id: overrides?.sessionId ?? "session-123",
            twoFactorVerified: overrides?.twoFactorVerified ?? true,
        },
        twoFactorVerified: overrides?.twoFactorVerified ?? true,
    }
}

async function readJson(response: Response) {
    return response.json() as Promise<{
        data?: Record<string, unknown>
        error?: { code?: string; message?: string }
    }>
}

describe("vault routes", () => {
    beforeEach(() => {
        vi.clearAllMocks()

        getClientIp.mockResolvedValue("127.0.0.1")
        rateLimit.mockResolvedValue(null)
        getVaultSession.mockResolvedValue(makeSession())
        getCredentialAccount.mockResolvedValue({ id: "account-123", password: "hash" })
        hashCredentialSecret.mockResolvedValue("hashed-secret")
        verifyCredentialSecret.mockResolvedValue(true)
        createFakeAuthSalt.mockImplementation((email: string) => `fake-${email}`)
        normalizeEmail.mockImplementation((email: string) => email.trim().toLowerCase())
        enforceVaultRequestGuards.mockResolvedValue(null)
        persistOwnedDropKey.mockResolvedValue(undefined)

        prisma.user.findUnique.mockResolvedValue({
            security: {
                authSalt: "b".repeat(43),
                kdfVersion: 2,
            },
        })
        prisma.userSecurity.findUnique.mockResolvedValue({
            id: "cmau000000000000000000001",
            authSalt: "a".repeat(43),
            vaultSalt: "c".repeat(43),
            passwordWrappedVaultKey: "d".repeat(64),
            vaultGeneration: 1,
            kdfVersion: 1,
        })
        prisma.drop.findFirst.mockResolvedValue({ id: "drop-123" })
        prisma.dropOwnerKey.findUnique.mockResolvedValue({
            userId: "user-123",
            dropId: "drop-123",
            wrappedKey: "e".repeat(32),
            vaultGeneration: 1,
        })
        prisma.dropOwnerKey.findMany.mockResolvedValue([
            {
                dropId: "drop-123",
                wrappedKey: "e".repeat(32),
                vaultGeneration: 1,
            },
        ])
        prisma.$transaction.mockImplementation(async (callback: unknown) => {
            if (typeof callback === "function") {
                return callback({
                    account: {
                        update: vi.fn().mockResolvedValue(undefined),
                        create: vi.fn().mockResolvedValue(undefined),
                    },
                    userSecurity: {
                        create: vi.fn().mockResolvedValue({
                            id: "cmau000000000000000000001",
                            vaultGeneration: 1,
                        }),
                        update: vi.fn().mockResolvedValue({
                            id: "cmau000000000000000000001",
                            vaultGeneration: 2,
                        }),
                    },
                    session: {
                        deleteMany: vi.fn().mockResolvedValue(undefined),
                    },
                })
            }

            return null
        })
    })

    it("returns deterministic bootstrap data for a known user", async () => {
        const { POST } = await import("@/app/api/vault/bootstrap/route")

        const response = await POST(new Request("http://localhost/api/vault/bootstrap", {
            method: "POST",
            body: JSON.stringify({ email: "User@example.com" }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(200)
        expect(payload.data?.authSalt).toBe("b".repeat(43))
        expect(payload.data?.kdfVersion).toBe(2)
    })

    it("rate-limits bootstrap requests", async () => {
        rateLimit.mockResolvedValueOnce(apiError("Too many requests", ErrorCodes.RATE_LIMITED, "req-bootstrap", 429))
        const { POST } = await import("@/app/api/vault/bootstrap/route")

        const response = await POST(new Request("http://localhost/api/vault/bootstrap", {
            method: "POST",
            body: JSON.stringify({ email: "user@example.com" }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(429)
        expect(payload.error?.code).toBe(ErrorCodes.RATE_LIMITED)
    })

    it("rejects vault setup from a stale session before mutating credentials", async () => {
        // getVaultSession returns null when the route requests freshness for a stale session.
        getVaultSession.mockResolvedValueOnce(null)
        const { POST } = await import("@/app/api/vault/setup/route")

        const response = await POST(new Request("http://localhost/api/vault/setup", {
            method: "POST",
            body: JSON.stringify({
                authSecret: "a".repeat(32),
                authSalt: "b".repeat(43),
                vaultSalt: "c".repeat(43),
                passwordWrappedVaultKey: "d".repeat(64),
            }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(401)
        expect(payload.error?.code).toBe(ErrorCodes.UNAUTHORIZED)
        expect(getVaultSession).toHaveBeenCalledWith({ require2FA: false, fresh: true })
        expect(hashCredentialSecret).not.toHaveBeenCalled()
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it("rejects vault setup until 2FA is verified", async () => {
        getVaultSession.mockResolvedValueOnce(makeSession({
            twoFactorEnabled: true,
            twoFactorVerified: false,
        }))
        const { POST } = await import("@/app/api/vault/setup/route")

        const response = await POST(new Request("http://localhost/api/vault/setup", { method: "POST" }))

        const payload = await readJson(response)
        expect(response.status).toBe(401)
        expect(payload.error?.code).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("surfaces CSRF rejection for vault setup", async () => {
        enforceVaultRequestGuards.mockResolvedValueOnce(
            apiError("Invalid CSRF token", ErrorCodes.FORBIDDEN, "req-csrf", 403),
        )
        const { POST } = await import("@/app/api/vault/setup/route")

        const response = await POST(new Request("http://localhost/api/vault/setup", { method: "POST" }))

        const payload = await readJson(response)
        expect(response.status).toBe(403)
        expect(payload.error?.code).toBe(ErrorCodes.FORBIDDEN)
    })

    it("surfaces rate-limit rejection for vault setup", async () => {
        enforceVaultRequestGuards.mockResolvedValueOnce(
            apiError("Too many requests", ErrorCodes.RATE_LIMITED, "req-rate", 429),
        )
        const { POST } = await import("@/app/api/vault/setup/route")

        const response = await POST(new Request("http://localhost/api/vault/setup", { method: "POST" }))

        const payload = await readJson(response)
        expect(response.status).toBe(429)
        expect(payload.error?.code).toBe(ErrorCodes.RATE_LIMITED)
    })

    it("creates vault setup materials for a social-only account", async () => {
        getCredentialAccount.mockResolvedValueOnce(null)
        prisma.userSecurity.findUnique.mockResolvedValueOnce(null)
        const { POST } = await import("@/app/api/vault/setup/route")

        const response = await POST(new Request("http://localhost/api/vault/setup", {
            method: "POST",
            body: JSON.stringify({
                authSecret: "a".repeat(32),
                authSalt: "b".repeat(43),
                vaultSalt: "c".repeat(43),
                passwordWrappedVaultKey: "d".repeat(64),
            }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(200)
        expect(payload.data?.vaultId).toBe("cmau000000000000000000001")
        expect(payload.data?.vaultGeneration).toBe(1)
        expect(getVaultSession).toHaveBeenCalledWith({ require2FA: false, fresh: true })
    })

    it("allows vault setup when a credential account has no existing password", async () => {
        getCredentialAccount.mockResolvedValueOnce({ id: "account-123", password: null })
        prisma.userSecurity.findUnique.mockResolvedValueOnce(null)
        const tx = {
            account: {
                update: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockResolvedValue(undefined),
            },
            userSecurity: {
                create: vi.fn().mockResolvedValue({
                    id: "cmau000000000000000000001",
                    vaultGeneration: 1,
                }),
            },
        }
        prisma.$transaction.mockImplementationOnce(async (callback: unknown) => {
            if (typeof callback !== "function") return null
            return callback(tx)
        })
        const { POST } = await import("@/app/api/vault/setup/route")

        const response = await POST(new Request("http://localhost/api/vault/setup", {
            method: "POST",
            body: JSON.stringify({
                authSecret: "a".repeat(32),
                authSalt: "b".repeat(43),
                vaultSalt: "c".repeat(43),
                passwordWrappedVaultKey: "d".repeat(64),
            }),
        }))

        expect(response.status).toBe(200)
        expect(verifyCredentialSecret).not.toHaveBeenCalled()
        expect(tx.account.update).toHaveBeenCalledWith({
            where: { id: "account-123" },
            data: { password: "hashed-secret" },
        })
    })

    it("rejects vault setup when an existing password is omitted without replacing its hash", async () => {
        prisma.userSecurity.findUnique.mockResolvedValueOnce(null)
        const { POST } = await import("@/app/api/vault/setup/route")

        const response = await POST(new Request("http://localhost/api/vault/setup", {
            method: "POST",
            body: JSON.stringify({
                authSecret: "a".repeat(32),
                authSalt: "b".repeat(43),
                vaultSalt: "c".repeat(43),
                passwordWrappedVaultKey: "d".repeat(64),
            }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(401)
        expect(payload.error?.message).toBe("Current password is required")
        expect(verifyCredentialSecret).not.toHaveBeenCalled()
        expect(hashCredentialSecret).not.toHaveBeenCalled()
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it("rejects vault setup when the existing password is wrong without replacing its hash", async () => {
        prisma.userSecurity.findUnique.mockResolvedValueOnce(null)
        verifyCredentialSecret.mockResolvedValueOnce(false)
        const { POST } = await import("@/app/api/vault/setup/route")

        const response = await POST(new Request("http://localhost/api/vault/setup", {
            method: "POST",
            body: JSON.stringify({
                currentPassword: "wrong-password-value",
                authSecret: "a".repeat(32),
                authSalt: "b".repeat(43),
                vaultSalt: "c".repeat(43),
                passwordWrappedVaultKey: "d".repeat(64),
            }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(401)
        expect(payload.error?.message).toBe("Incorrect password")
        expect(verifyCredentialSecret).toHaveBeenCalledWith("user-123", "wrong-password-value")
        expect(hashCredentialSecret).not.toHaveBeenCalled()
        expect(prisma.$transaction).not.toHaveBeenCalled()
    })

    it("verifies and updates an existing credential account while creating initial vault security", async () => {
        prisma.userSecurity.findUnique.mockResolvedValueOnce(null)
        const tx = {
            account: {
                update: vi.fn().mockResolvedValue(undefined),
                create: vi.fn().mockResolvedValue(undefined),
            },
            userSecurity: {
                create: vi.fn().mockResolvedValue({
                    id: "cmau000000000000000000001",
                    vaultGeneration: 1,
                }),
            },
        }
        prisma.$transaction.mockImplementationOnce(async (callback: unknown) => {
            if (typeof callback !== "function") return null
            return callback(tx)
        })
        const { POST } = await import("@/app/api/vault/setup/route")

        const response = await POST(new Request("http://localhost/api/vault/setup", {
            method: "POST",
            body: JSON.stringify({
                currentPassword: "legacy-1",
                authSecret: "a".repeat(32),
                authSalt: "b".repeat(43),
                vaultSalt: "c".repeat(43),
                passwordWrappedVaultKey: "d".repeat(64),
            }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(200)
        expect(payload.data?.vaultGeneration).toBe(1)
        expect(verifyCredentialSecret).toHaveBeenCalledWith("user-123", "legacy-1")
        expect(tx.account.update).toHaveBeenCalledWith({
            where: { id: "account-123" },
            data: { password: "hashed-secret" },
        })
        expect(tx.account.create).not.toHaveBeenCalled()
        expect(tx.userSecurity.create).toHaveBeenCalledWith({
            data: {
                userId: "user-123",
                authSalt: "b".repeat(43),
                vaultSalt: "c".repeat(43),
                passwordWrappedVaultKey: "d".repeat(64),
                kdfVersion: 1,
            },
            select: { id: true, vaultGeneration: true },
        })
    })

    it("rejects unlock-materials without a session", async () => {
        getVaultSession.mockResolvedValueOnce(null)
        const { GET } = await import("@/app/api/vault/unlock/route")

        const response = await GET()

        const payload = await readJson(response)
        expect(response.status).toBe(401)
        expect(payload.error?.code).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("surfaces rate-limit rejection for unlock-materials", async () => {
        enforceVaultRequestGuards.mockResolvedValueOnce(
            apiError("Too many requests", ErrorCodes.RATE_LIMITED, "req-rate", 429),
        )
        const { GET } = await import("@/app/api/vault/unlock/route")

        const response = await GET()

        const payload = await readJson(response)
        expect(response.status).toBe(429)
        expect(payload.error?.code).toBe(ErrorCodes.RATE_LIMITED)
    })

    it("returns unlock materials when vault security is configured", async () => {
        const { GET } = await import("@/app/api/vault/unlock/route")

        const response = await GET()

        const payload = await readJson(response)
        expect(response.status).toBe(200)
        expect(payload.data?.vaultSalt).toBe("c".repeat(43))
        expect(payload.data?.vaultGeneration).toBe(1)
    })

    it("rejects change-password without a session", async () => {
        getVaultSession.mockResolvedValueOnce(null)
        const { POST } = await import("@/app/api/vault/change-password/route")

        const response = await POST(new Request("http://localhost/api/vault/change-password", { method: "POST" }))

        const payload = await readJson(response)
        expect(response.status).toBe(401)
        expect(payload.error?.code).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("changes the vault password and rotates vault generation", async () => {
        const { POST } = await import("@/app/api/vault/change-password/route")

        const response = await POST(new Request("http://localhost/api/vault/change-password", {
            method: "POST",
            body: JSON.stringify({
                currentAuthSecret: "a".repeat(32),
                newAuthSecret: "b".repeat(32),
                newAuthSalt: "c".repeat(43),
                newVaultSalt: "d".repeat(43),
                newPasswordWrappedVaultKey: "e".repeat(64),
            }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(200)
        expect(payload.data?.vaultGeneration).toBe(2)
    })

    it("rejects drop-key writes without a session", async () => {
        getVaultSession.mockResolvedValueOnce(null)
        const { POST } = await import("@/app/api/vault/drop-keys/route")

        const response = await POST(new Request("http://localhost/api/vault/drop-keys", { method: "POST" }))

        const payload = await readJson(response)
        expect(response.status).toBe(401)
        expect(payload.error?.code).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("surfaces CSRF rejection for drop-key writes", async () => {
        enforceVaultRequestGuards.mockResolvedValueOnce(
            apiError("Invalid CSRF token", ErrorCodes.FORBIDDEN, "req-csrf", 403),
        )
        const { POST } = await import("@/app/api/vault/drop-keys/route")

        const response = await POST(new Request("http://localhost/api/vault/drop-keys", { method: "POST" }))

        const payload = await readJson(response)
        expect(response.status).toBe(403)
        expect(payload.error?.code).toBe(ErrorCodes.FORBIDDEN)
    })

    it("stores a wrapped drop key for the active vault", async () => {
        prisma.userSecurity.findUnique.mockResolvedValueOnce({
            id: "cmau000000000000000000001",
            vaultGeneration: 1,
        })
        prisma.drop.findFirst.mockResolvedValueOnce({ id: "drop-123" })
        const { POST } = await import("@/app/api/vault/drop-keys/route")

        const response = await POST(new Request("http://localhost/api/vault/drop-keys", {
            method: "POST",
            body: JSON.stringify({
                dropId: "drop-123",
                wrappedKey: "e".repeat(32),
                vaultId: "cmau000000000000000000001",
                vaultGeneration: 1,
            }),
        }))

        const payload = await readJson(response)
        expect(response.status).toBe(200)
        expect(payload.data?.dropId).toBe("drop-123")
        expect(persistOwnedDropKey).toHaveBeenCalledWith(
            prisma,
            "user-123",
            "drop-123",
            "e".repeat(32),
            1,
        )
        expect(prisma.drop.findFirst).toHaveBeenCalledWith({
            where: {
                id: "drop-123",
                userId: "user-123",
                organizationId: null,
            },
            select: { id: true },
        })
    })

    it("rejects personal drop-key writes for organization-owned drops", async () => {
        prisma.drop.findFirst.mockResolvedValueOnce(null)
        const { POST } = await import("@/app/api/vault/drop-keys/route")

        const response = await POST(new Request("http://localhost/api/vault/drop-keys", {
            method: "POST",
            body: JSON.stringify({
                dropId: "org-drop",
                wrappedKey: "e".repeat(32),
                vaultId: "cmau000000000000000000001",
                vaultGeneration: 1,
            }),
        }))

        expect(response.status).toBe(404)
        expect(prisma.drop.findFirst).toHaveBeenCalledWith({
            where: {
                id: "org-drop",
                userId: "user-123",
                organizationId: null,
            },
            select: { id: true },
        })
        expect(persistOwnedDropKey).not.toHaveBeenCalled()
    })

    it("rejects migration-status without a session", async () => {
        getVaultSession.mockResolvedValueOnce(null)
        const { GET } = await import("@/app/api/vault/migration-status/route")

        const response = await GET()

        const payload = await readJson(response)
        expect(response.status).toBe(401)
        expect(payload.error?.code).toBe(ErrorCodes.UNAUTHORIZED)
    })

    it("surfaces rate-limit rejection for migration-status", async () => {
        enforceVaultRequestGuards.mockResolvedValueOnce(
            apiError("Too many requests", ErrorCodes.RATE_LIMITED, "req-rate", 429),
        )
        const { GET } = await import("@/app/api/vault/migration-status/route")

        const response = await GET()

        const payload = await readJson(response)
        expect(response.status).toBe(429)
        expect(payload.error?.code).toBe(ErrorCodes.RATE_LIMITED)
    })

    it("returns the current migration state for a configured vault", async () => {
        const { GET } = await import("@/app/api/vault/migration-status/route")

        const response = await GET()

        const payload = await readJson(response)
        expect(response.status).toBe(200)
        expect(payload.data?.hasVault).toBe(true)
        expect(payload.data?.needsPassword).toBe(false)
        expect(payload.data?.vaultGeneration).toBe(1)
    })

    it("requires vault password setup when vault security is missing", async () => {
        prisma.userSecurity.findUnique.mockResolvedValueOnce(null)
        const { GET } = await import("@/app/api/vault/migration-status/route")

        const response = await GET()

        const payload = await readJson(response)
        expect(response.status).toBe(200)
        expect(payload.data?.hasPassword).toBe(true)
        expect(payload.data?.hasVault).toBe(false)
        expect(payload.data?.needsPassword).toBe(true)
    })
})
