/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import type { ZodType } from "zod"

interface GrantRow {
    id: string
    userId: string
    clientId: string
}

type Where = Partial<Pick<GrantRow, "userId" | "clientId">>

/** In-memory table with Prisma's deleteMany semantics for equality filters. */
function table(rows: GrantRow[]) {
    return {
        rows,
        deleteMany: vi.fn(async ({ where }: { where: Where }) => {
            const before = rows.length
            const kept = rows.filter((row) =>
                !Object.entries(where).every(([key, value]) => row[key as keyof GrantRow] === value))
            rows.splice(0, rows.length, ...kept)
            return { count: before - kept.length }
        }),
    }
}

const db = vi.hoisted(() => ({
    oauthConsent: null as unknown as ReturnType<typeof table>,
    oauthRefreshToken: null as unknown as ReturnType<typeof table>,
    oauthAccessToken: null as unknown as ReturnType<typeof table>,
    $transaction: vi.fn(async (operations: Promise<unknown>[]) => Promise.all(operations)),
}))

vi.mock("@/lib/prisma", () => ({ prisma: db }))

function seed() {
    const rowsFor = (prefix: string) => [
        { id: `${prefix}-me-claude`, userId: "user-me", clientId: "client-claude" },
        { id: `${prefix}-me-cursor`, userId: "user-me", clientId: "client-cursor" },
        { id: `${prefix}-other-claude`, userId: "user-other", clientId: "client-claude" },
    ]
    db.oauthConsent = table(rowsFor("consent"))
    db.oauthRefreshToken = table(rowsFor("refresh"))
    db.oauthAccessToken = table(rowsFor("access"))
}

describe("revokeConnectedApp", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        seed()
    })

    it("deletes only the user's consent and tokens for that client, in one transaction", async () => {
        const { revokeConnectedApp } = await import("@/lib/services/connected-apps")

        await revokeConnectedApp("user-me", "client-claude")

        expect(db.$transaction).toHaveBeenCalledTimes(1)
        for (const model of [db.oauthConsent, db.oauthRefreshToken, db.oauthAccessToken]) {
            expect(model.deleteMany).toHaveBeenCalledWith({ where: { userId: "user-me", clientId: "client-claude" } })
            // The same client stays connected for another user, and the user's
            // other apps are untouched.
            expect(model.rows.map((row) => `${row.userId}/${row.clientId}`)).toEqual([
                "user-me/client-cursor",
                "user-other/client-claude",
            ])
        }
    })

    it("throws NotFound when the user has no grant for the client (e.g. another user's app)", async () => {
        const { revokeConnectedApp } = await import("@/lib/services/connected-apps")
        const { NotFoundError } = await import("@/lib/api-error-utils")

        await expect(revokeConnectedApp("user-other", "client-cursor")).rejects.toBeInstanceOf(NotFoundError)
        expect(db.oauthConsent.rows).toHaveLength(3)
        expect(db.oauthRefreshToken.rows).toHaveLength(3)
        expect(db.oauthAccessToken.rows).toHaveLength(3)
    })
})

describe("revokeConnectedAppAction", () => {
    const runSecureAction = vi.fn()
    const revalidatePath = vi.fn()

    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        seed()
        vi.doMock("next/cache", () => ({ revalidatePath }))
        vi.doMock("@/lib/safe-action", () => {
            // Mirrors runSecureAction's contract: session user id, validated data.
            runSecureAction.mockImplementation(async (
                options: { schema: ZodType<unknown>; data: unknown },
                handler: (data: unknown, userId: string) => Promise<unknown>,
            ) => {
                const parsed = options.schema.safeParse(options.data)
                if (!parsed.success) return { error: parsed.error.issues[0]?.message }
                try {
                    return { success: true, data: await handler(parsed.data, "user-me") }
                } catch (error) {
                    return { error: (error as Error).message }
                }
            })
            return { runSecureAction }
        })
    })

    it("revokes for the session user only, rate limited", async () => {
        const { revokeConnectedAppAction } = await import("@/actions/connected-apps")

        const result = await revokeConnectedAppAction("client-claude")

        expect(result).toEqual({ success: true, data: undefined })
        expect(runSecureAction).toHaveBeenCalledWith(
            expect.objectContaining({ rateLimitKey: "connectedAppRevoke", data: { clientId: "client-claude" } }),
            expect.any(Function),
        )
        expect(db.oauthConsent.rows.map((row) => row.id)).toEqual(["consent-me-cursor", "consent-other-claude"])
        expect(revalidatePath).toHaveBeenCalledWith("/dashboard/settings")
    })

    it("rejects an empty client id without touching the database", async () => {
        const { revokeConnectedAppAction } = await import("@/actions/connected-apps")

        const result = await revokeConnectedAppAction("")

        expect(result.error).toBe("Invalid app")
        expect(db.$transaction).not.toHaveBeenCalled()
    })
})

describe("getConnectedApps", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("reads only the user's consents and maps scopes, publisher and last activity", async () => {
        const consentFindMany = vi.fn(async () => [{
            clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
            scopes: ["anon.li:aliases", "offline_access"],
            createdAt: new Date("2026-09-01T00:00:00.000Z"),
            updatedAt: new Date("2026-09-02T00:00:00.000Z"),
            client: { name: "Claude", clientDiscoveryId: "cimd-1" },
        }, {
            clientId: "dcr-client",
            scopes: ["anon.li:drops"],
            createdAt: new Date("2026-08-01T00:00:00.000Z"),
            updatedAt: new Date("2026-08-01T00:00:00.000Z"),
            client: { name: null, clientDiscoveryId: null },
        }])
        const groupBy = vi.fn(async () => [
            { clientId: "dcr-client", _max: { createdAt: new Date("2026-10-09T00:00:00.000Z") } },
        ])
        Object.assign(db, {
            oauthConsent: { findMany: consentFindMany },
            oauthRefreshToken: { groupBy },
        })
        const { getConnectedApps } = await import("@/lib/data/connected-apps")

        const apps = await getConnectedApps("user-me")

        expect(consentFindMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-me" } }))
        expect(groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "user-me" } }))
        expect(apps).toEqual([
            {
                clientId: "dcr-client",
                name: "dcr-client",
                publisher: null,
                scopes: [{ key: "anon.li:drops", label: "Drops" }],
                connectedAt: new Date("2026-08-01T00:00:00.000Z"),
                lastActiveAt: new Date("2026-10-09T00:00:00.000Z"),
            },
            {
                clientId: "https://claude.ai/oauth/mcp-oauth-client-metadata",
                name: "Claude",
                publisher: "claude.ai",
                scopes: [
                    { key: "anon.li:aliases", label: "Aliases" },
                    { key: "offline_access", label: "Stay connected" },
                ],
                connectedAt: new Date("2026-09-01T00:00:00.000Z"),
                lastActiveAt: new Date("2026-09-02T00:00:00.000Z"),
            },
        ])
    })
})
