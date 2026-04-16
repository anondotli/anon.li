import { createLogger } from "@/lib/logger"

const logger = createLogger("VaultAPI")

export function logVaultWarn(
    route: string,
    message: string,
    options: {
        requestId: string
        userId?: string | null
        data?: Record<string, unknown>
    },
) {
    logger.warn(message, {
        route,
        requestId: options.requestId,
        userId: options.userId ?? null,
        ...options.data,
    })
}

export function logVaultError(
    route: string,
    message: string,
    error: unknown,
    options: {
        requestId: string
        userId?: string | null
        data?: Record<string, unknown>
    },
) {
    logger.error(message, error, {
        route,
        requestId: options.requestId,
        userId: options.userId ?? null,
        ...options.data,
    })
}
