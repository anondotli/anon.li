import { auth } from "@/auth"
import { getAuthUserState } from "@/lib/data/auth"
import { rateLimit, rateLimiters } from "@/lib/rate-limit"
import { logError } from "@/lib/logger"
import { UpgradeRequiredError, type UpgradeRequiredDetails } from "@/lib/api-error-utils"
import { z } from "zod"

export type ActionState<D = unknown> = {
  error?: string
  success?: boolean
  data?: D
  code?: string
  upgrade?: UpgradeRequiredDetails
}

type SecureActionOptions<T> = {
  schema?: z.ZodSchema<T>
  data?: unknown
  rateLimitKey?: keyof typeof rateLimiters
}

type AdminActionOptions<T> = {
  schema?: z.ZodSchema<T>
  data?: unknown
}

function parseActionData<T>(schema: z.ZodSchema<T> | undefined, data: unknown): { data: T } | { error: string } {
  if (schema) {
    const result = schema.safeParse(data)
    if (!result.success) {
      return { error: result.error.issues[0]?.message || "Validation failed" }
    }
    return { data: result.data }
  }
  return { data: data as T }
}

export async function runAdminAction<T = void, R = unknown>(
  options: AdminActionOptions<T>,
  handler: (validatedData: T, adminId: string) => Promise<R>
): Promise<ActionState<R>> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "Not authenticated" }
  }

  if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
    return { error: "Two-factor authentication required" }
  }

  const user = await getAuthUserState(session.user.id)

  if (!user?.isAdmin || user.banned) {
    return { error: "Unauthorized" }
  }

  const parsed = parseActionData(options.schema, options.data)
  if ("error" in parsed) return { error: parsed.error }
  const validatedData = parsed.data

  try {
    const result = await handler(validatedData, user.id)
    return { success: true, data: result }
  } catch (error) {
    logError("AdminAction", "Operation failed", error)
    return { error: "Operation failed" }
  }
}

export async function runSecureAction<T = void, R = unknown>(
  options: SecureActionOptions<T>,
  handler: (validatedData: T, userId: string) => Promise<R>
): Promise<ActionState<R>> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "Not authenticated" }
  }

  if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
    return { error: "Two-factor authentication required" }
  }

  const userId = session.user.id

  const user = await getAuthUserState(userId)

  if (user?.banned) {
    return { error: "Account suspended" }
  }

  if (options.rateLimitKey) {
    const limited = await rateLimit(options.rateLimitKey, userId)
    if (limited) {
      return { error: "Too many requests. Please try again later." }
    }
  }

  const parsed = parseActionData(options.schema, options.data)
  if ("error" in parsed) return { error: parsed.error }
  const validatedData = parsed.data

  try {
    const result = await handler(validatedData, userId)
    return { success: true, data: result ?? undefined }
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return {
        error: error.message,
        code: error.code,
        upgrade: error.details,
      }
    }
    logError("SecureAction", "Operation failed", error)
    return { error: "Operation failed" }
  }
}
