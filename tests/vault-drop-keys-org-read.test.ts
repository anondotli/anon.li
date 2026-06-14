/**
 * @vitest-environment node
 *
 * Server contract for org shared-E2EE owner-key READS on /api/vault/drop-keys.
 * The core of "team drops are decryptable by all members": a member of the drop's
 * org may fetch the org-wrapped owner key (even though they didn't create it),
 * a non-member is denied (404, no existence leak), and the list returns the
 * caller's personal keys plus every org key for orgs they belong to.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { getVaultSession, enforceVaultRequestGuards, getVaultSchemaState, prisma } = vi.hoisted(() => ({
    getVaultSession: vi.fn(),
    enforceVaultRequestGuards: vi.fn(),
    getVaultSchemaState: vi.fn(),
    prisma: {
        dropOwnerKey: { findUnique: vi.fn(), findMany: vi.fn() },
        member: { findUnique: vi.fn(), findMany: vi.fn() },
    },
}))

vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/vault/server", () => ({ getVaultSession }))
vi.mock("@/lib/vault/http", () => ({ enforceVaultRequestGuards }))
vi.mock("@/lib/vault/schema", () => ({
    getVaultSchemaState,
    VAULT_SCHEMA_UNAVAILABLE_MESSAGE: "Vault schema unavailable",
}))
vi.mock("@/lib/vault/api", () => ({ logVaultError: vi.fn(), logVaultWarn: vi.fn() }))

import { GET } from "@/app/api/vault/drop-keys/route"

const SCHEMA_OK = { userSecurity: true, dropOwnerKeys: true }
const single = (dropId: string) => new Request(`https://x/api/vault/drop-keys?dropId=${dropId}`, { method: "GET" })
const list = () => new Request("https://x/api/vault/drop-keys", { method: "GET" })

beforeEach(() => {
    vi.clearAllMocks()
    enforceVaultRequestGuards.mockResolvedValue(null)
    getVaultSchemaState.mockResolvedValue(SCHEMA_OK)
    getVaultSession.mockResolvedValue({ user: { id: "member" } })
})

describe("GET /api/vault/drop-keys org-membership read scoping", () => {
    it("returns an org drop's owner key to a member who did NOT create it", async () => {
        // Org key created by someone else; caller is a member of that org.
        prisma.dropOwnerKey.findUnique.mockResolvedValue({
            userId: "creator", dropId: "d1", wrappedKey: "w", vaultGeneration: 1,
            organizationId: "org-1", orgKeyGeneration: 2,
        })
        prisma.member.findUnique.mockResolvedValue({ id: "m1" }) // caller is a member

        const res = await GET(single("d1"))
        expect(res.status).toBe(200)
        const body = await res.json()
        expect(body.data.organizationId).toBe("org-1")
        expect(prisma.member.findUnique).toHaveBeenCalledWith({
            where: { organizationId_userId: { organizationId: "org-1", userId: "member" } },
            select: { id: true },
        })
    })

    it("404s an org drop key for a NON-member (no existence leak)", async () => {
        prisma.dropOwnerKey.findUnique.mockResolvedValue({
            userId: "creator", dropId: "d1", wrappedKey: "w", vaultGeneration: 1,
            organizationId: "org-1", orgKeyGeneration: 2,
        })
        prisma.member.findUnique.mockResolvedValue(null) // not a member

        expect((await GET(single("d1"))).status).toBe(404)
    })

    it("denies a personal owner key belonging to another user", async () => {
        prisma.dropOwnerKey.findUnique.mockResolvedValue({
            userId: "someone-else", dropId: "d1", wrappedKey: "w", vaultGeneration: 1,
            organizationId: null, orgKeyGeneration: null,
        })
        expect((await GET(single("d1"))).status).toBe(404)
    })

    it("list returns personal keys plus org keys for the caller's orgs", async () => {
        prisma.member.findMany.mockResolvedValue([{ organizationId: "org-1" }, { organizationId: "org-2" }])
        prisma.dropOwnerKey.findMany.mockResolvedValue([
            { dropId: "p1", wrappedKey: "w", vaultGeneration: 1, organizationId: null, orgKeyGeneration: null },
            { dropId: "o1", wrappedKey: "w", vaultGeneration: 1, organizationId: "org-1", orgKeyGeneration: 1 },
        ])

        const res = await GET(list())
        expect(res.status).toBe(200)
        // The WHERE unions personal (organizationId null) with the member's org ids.
        const where = prisma.dropOwnerKey.findMany.mock.calls[0]![0].where
        expect(where.OR).toEqual([
            { userId: "member", organizationId: null },
            { organizationId: { in: ["org-1", "org-2"] } },
        ])
    })
})
