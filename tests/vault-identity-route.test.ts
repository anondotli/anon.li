/**
 * @vitest-environment node
 *
 * Server contract for the identity-keypair publish/fetch endpoint
 * (app/api/vault/identity). Covers auth, vault-schema gating, payload
 * validation, vault-identity binding (id + generation), and that the wrapped
 * private key is only persisted when it matches the current vault generation.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

// vi.hoisted so these exist before the (hoisted) route import triggers the mocks.
const { getVaultSession, enforceVaultRequestGuards, prisma } = vi.hoisted(() => ({
    getVaultSession: vi.fn(),
    enforceVaultRequestGuards: vi.fn(),
    prisma: {
        userSecurity: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/vault/server", () => ({ getVaultSession }))
vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))
vi.mock("@/lib/vault/api", () => ({
    logVaultError: vi.fn(),
    logVaultWarn: vi.fn(),
}))

import { GET, POST } from "@/app/api/vault/identity/route"

const VAULT_ID = "clf2x8q9b0000qzrmn831i7rn" // cuid
const PUBKEY = "A".repeat(88) // base64url, within [80,256]
const WRAPPED = "B".repeat(200) // base64url, within [100,2048]

function postReq(body: unknown): Request {
    return new Request("https://x/api/vault/identity", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
    })
}
const getReq = () => new Request("https://x/api/vault/identity", { method: "GET" })

const validPayload = {
    identityPublicKey: PUBKEY,
    wrappedIdentityPrivateKey: WRAPPED,
    vaultId: VAULT_ID,
    vaultGeneration: 3,
}

beforeEach(() => {
    vi.clearAllMocks()
    enforceVaultRequestGuards.mockResolvedValue(null) // not blocked
})

describe("POST /api/vault/identity (publish own identity keypair)", () => {
    it("401 when unauthenticated", async () => {
        getVaultSession.mockResolvedValue(null)
        expect((await POST(postReq(validPayload))).status).toBe(401)
    })

    it("short-circuits with the guard response (e.g. CSRF/rate-limit)", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        const blocked = new Response("blocked", { status: 429 })
        enforceVaultRequestGuards.mockResolvedValue(blocked)
        expect(await POST(postReq(validPayload))).toBe(blocked)
    })

    it("400 on an invalid public key", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        expect((await POST(postReq({ ...validPayload, identityPublicKey: "!!!" }))).status).toBe(400)
    })

    it("404 when vault security is not configured", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.userSecurity.findUnique.mockResolvedValue(null)
        expect((await POST(postReq(validPayload))).status).toBe(404)
        expect(prisma.userSecurity.update).not.toHaveBeenCalled()
    })

    it("409 on vault identity (vaultId) mismatch", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.userSecurity.findUnique.mockResolvedValue({ id: "clDIFFERENT0000qzrmn831i7r", vaultGeneration: 3 })
        expect((await POST(postReq(validPayload))).status).toBe(409)
        expect(prisma.userSecurity.update).not.toHaveBeenCalled()
    })

    it("409 on vault generation mismatch (stale vault key) — does not persist", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.userSecurity.findUnique.mockResolvedValue({ id: VAULT_ID, vaultGeneration: 5 })
        expect((await POST(postReq(validPayload))).status).toBe(409)
        expect(prisma.userSecurity.update).not.toHaveBeenCalled()
    })

    it("persists the keypair bound to the current generation when identity matches", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.userSecurity.findUnique.mockResolvedValue({ id: VAULT_ID, vaultGeneration: 3 })
        prisma.userSecurity.update.mockResolvedValue({})
        const res = await POST(postReq(validPayload))
        expect(res.status).toBe(200)
        expect(prisma.userSecurity.update).toHaveBeenCalledWith({
            where: { userId: "u1" },
            data: {
                identityPublicKey: PUBKEY,
                wrappedIdentityPrivateKey: WRAPPED,
                identityKeyGeneration: 3,
            },
        })
    })
})

describe("GET /api/vault/identity (recover own material)", () => {
    it("401 when unauthenticated", async () => {
        getVaultSession.mockResolvedValue(null)
        expect((await GET(getReq())).status).toBe(401)
    })

    it("404 when vault security is not configured", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.userSecurity.findUnique.mockResolvedValue(null)
        expect((await GET(getReq())).status).toBe(404)
    })

    it("returns the stored identity material", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.userSecurity.findUnique.mockResolvedValue({
            identityPublicKey: PUBKEY,
            wrappedIdentityPrivateKey: WRAPPED,
            identityKeyGeneration: 2,
        })
        const res = await GET(getReq())
        expect(res.status).toBe(200)
        expect(JSON.stringify(await res.json())).toContain(PUBKEY)
    })

    it("returns null identity fields before provisioning (client treats as 'needs provisioning')", async () => {
        getVaultSession.mockResolvedValue({ user: { id: "u1" } })
        prisma.userSecurity.findUnique.mockResolvedValue({
            identityPublicKey: null,
            wrappedIdentityPrivateKey: null,
            identityKeyGeneration: null,
        })
        const res = await GET(getReq())
        expect(res.status).toBe(200)
    })
})
