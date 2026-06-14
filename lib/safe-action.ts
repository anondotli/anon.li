import { auth } from "@/auth"
import { getAuthUserState } from "@/lib/data/auth"
import { rateLimit, rateLimiters } from "@/lib/rate-limit"
import { logError } from "@/lib/logger"
import { UpgradeRequiredError, ValidationError, type UpgradeRequiredDetails } from "@/lib/api-error-utils"
import { personalScope, orgScope, meetsMinRole, type OwnerScope, type OrgRole } from "@/lib/ownership"
import { requiresTwoFactorChallenge, orgRequiresTwoFactorSetup } from "@/lib/access-policy"
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

  if (requiresTwoFactorChallenge(session)) {
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

  if (requiresTwoFactorChallenge(session)) {
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
    // ValidationError carries a user-facing "bad request" message by design.
    if (error instanceof ValidationError) {
      return { error: error.message }
    }
    logError("SecureAction", "Operation failed", error)
    return { error: "Operation failed" }
  }
}

type ScopedActionOptions<T> = {
  schema?: z.ZodSchema<T>
  data?: unknown
  rateLimitKey?: keyof typeof rateLimiters
  /** Require an active organization context (reject personal-context calls). */
  requireOrg?: boolean
  /** Minimum org role required (implies requireOrg). */
  minRole?: OrgRole
}

/**
 * Server-action wrapper for owned-resource operations that are org-aware.
 *
 * Resolves an OwnerScope from the session's active organization (set via the
 * org switcher) and passes it to the handler, so the same action transparently
 * targets personal or org-owned resources. Use this — not runSecureAction — for
 * actions touching aliases/recipients/domains/drops/forms/api-keys once those
 * resources are org-scoped (see lib/ownership.ts).
 */
export async function runScopedAction<T = void, R = unknown>(
  options: ScopedActionOptions<T>,
  handler: (validatedData: T, scope: OwnerScope) => Promise<R>
): Promise<ActionState<R>> {
  const session = await auth()
  if (!session?.user?.id) {
    return { error: "Not authenticated" }
  }

  if (requiresTwoFactorChallenge(session)) {
    return { error: "Two-factor authentication required" }
  }

  const userId = session.user.id

  const user = await getAuthUserState(userId)
  if (user?.banned) {
    return { error: "Account suspended" }
  }

  // Org-wide 2FA enforcement: if the active org requires 2FA and the user hasn't
  // enrolled it at all, block here (the enrolled-but-unverified case is already
  // covered by requiresTwoFactorChallenge above).
  if (orgRequiresTwoFactorSetup(session)) {
    return { error: "Your team requires two-factor authentication. Enable it in your security settings to continue." }
  }

  // Build the owner scope from the active organization context on the session.
  const scope: OwnerScope =
    session.activeOrganizationId && session.activeOrgRole
      ? orgScope(userId, session.activeOrganizationId, session.activeOrgRole)
      : personalScope(userId)

  if ((options.requireOrg || options.minRole) && scope.organizationId === null) {
    return { error: "No active organization" }
  }
  if (options.minRole && !meetsMinRole(scope.role, options.minRole)) {
    return { error: "Insufficient organization role" }
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
    const result = await handler(validatedData, scope)
    return { success: true, data: result ?? undefined }
  } catch (error) {
    if (error instanceof UpgradeRequiredError) {
      return {
        error: error.message,
        code: error.code,
        upgrade: error.details,
      }
    }
    // ValidationError carries a user-facing "bad request" message by design.
    if (error instanceof ValidationError) {
      return { error: error.message }
    }
    logError("ScopedAction", "Operation failed", error)
    return { error: "Operation failed" }
  }
}
