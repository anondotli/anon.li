import { ErrorCodes, apiError, withNoStore } from "@/lib/api-response"
import { ForbiddenError } from "@/lib/api-error-utils"
import { validateCsrf } from "@/lib/csrf"
import { rateLimit, type RateLimitKey } from "@/lib/rate-limit"
import { logVaultWarn } from "@/lib/vault/api"

export async function enforceVaultRequestGuards(options: {
    request?: Request
    requestId: string
    identifier: string
    route?: string
    csrf?: boolean
    rateLimitKey?: RateLimitKey
}): Promise<Response | null> {
    if (options.csrf) {
        if (!options.request) {
            throw new Error("CSRF validation requires a request object")
        }

        try {
            validateCsrf(options.request)
        } catch (error) {
            if (error instanceof ForbiddenError) {
                if (options.route) {
                    logVaultWarn(options.route, "CSRF validation failed", {
                        requestId: options.requestId,
                        userId: options.identifier,
                    })
                }
                return withNoStore(
                    apiError(error.message, ErrorCodes.FORBIDDEN, options.requestId, 403),
                )
            }

            throw error
        }
    }

    const rateLimited = await rateLimit(options.rateLimitKey ?? "vaultOps", options.identifier)
    if (rateLimited) {
        if (options.route) {
            logVaultWarn(options.route, "Vault request rate limited", {
                requestId: options.requestId,
                userId: options.identifier,
                data: { rateLimitKey: options.rateLimitKey ?? "vaultOps" },
            })
        }
        return withNoStore(rateLimited)
    }

    return null
}
