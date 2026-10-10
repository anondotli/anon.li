import "server-only"

import { prisma } from "@/lib/prisma"
import { mcpScopeLabel } from "@/lib/mcp/oauth-metadata"
import { parseHttpsUrl } from "@/lib/url-safety"

export interface ConnectedApp {
    clientId: string
    name: string
    /** Host that published a Client ID Metadata Document (CIMD clients only). */
    publisher: string | null
    scopes: { key: string; label: string }[]
    connectedAt: Date
    /**
     * Most recent grant or token refresh. Access tokens are stateless JWTs, so
     * this is the closest stored signal of activity (refreshes happen at most
     * hourly while the app is in use).
     */
    lastActiveAt: Date
}

/** OAuth clients (MCP connectors) the user has granted consent to, most recently active first. */
export async function getConnectedApps(userId: string): Promise<ConnectedApp[]> {
    const [consents, refreshActivity] = await Promise.all([
        prisma.oauthConsent.findMany({
            where: { userId },
            orderBy: { createdAt: "asc" },
            select: {
                clientId: true,
                scopes: true,
                createdAt: true,
                updatedAt: true,
                client: { select: { name: true, clientDiscoveryId: true } },
            },
        }),
        prisma.oauthRefreshToken.groupBy({
            by: ["clientId"],
            where: { userId },
            _max: { createdAt: true },
        }),
    ])

    const lastRefresh = new Map(refreshActivity.map((row) => [row.clientId, row._max.createdAt]))
    const apps = new Map<string, ConnectedApp>()

    // A user normally has one consent per client; fold any extras into one entry.
    for (const consent of consents) {
        const existing = apps.get(consent.clientId)
        const refreshedAt = lastRefresh.get(consent.clientId)
        const activity = [consent.updatedAt, refreshedAt, existing?.lastActiveAt]
            .filter((date): date is Date => date instanceof Date)
        const lastActiveAt = new Date(Math.max(...activity.map((date) => date.getTime())))
        const scopeKeys = Array.from(new Set([...(existing?.scopes.map((scope) => scope.key) ?? []), ...consent.scopes]))

        apps.set(consent.clientId, {
            clientId: consent.clientId,
            name: consent.client.name?.trim() || consent.clientId,
            publisher: consent.client.clientDiscoveryId ? parseHttpsUrl(consent.clientId)?.host ?? null : null,
            scopes: scopeKeys.map((key) => ({ key, label: mcpScopeLabel(key) })),
            connectedAt: existing?.connectedAt ?? consent.createdAt,
            lastActiveAt,
        })
    }

    return Array.from(apps.values()).sort((a, b) => b.lastActiveAt.getTime() - a.lastActiveAt.getTime())
}
