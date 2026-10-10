import "server-only"

import { prisma } from "@/lib/prisma"
import { NotFoundError } from "@/lib/api-error-utils"
import { createLogger } from "@/lib/logger"

const logger = createLogger("ConnectedApps")

/**
 * Revoke an OAuth client's (MCP connector's) access to one user's account:
 * the user's consent for the client and every refresh/access token the
 * client holds for that user, in one transaction. Strictly scoped to
 * `userId` — the client and other users' grants are untouched.
 *
 * Outstanding JWT access tokens are not stored; `/api/mcp` rejects them on
 * the next request because the consent row is gone (see
 * `isMcpGrantActive`).
 */
export async function revokeConnectedApp(userId: string, clientId: string): Promise<void> {
    const where = { userId, clientId }
    const [accessTokens, refreshTokens, consents] = await prisma.$transaction([
        prisma.oauthAccessToken.deleteMany({ where }),
        prisma.oauthRefreshToken.deleteMany({ where }),
        prisma.oauthConsent.deleteMany({ where }),
    ])

    if (consents.count === 0 && refreshTokens.count === 0 && accessTokens.count === 0) {
        throw new NotFoundError("Connected app not found")
    }

    logger.info("Connected app revoked", {
        userId,
        clientId,
        consents: consents.count,
        refreshTokens: refreshTokens.count,
        accessTokens: accessTokens.count,
    })
}
