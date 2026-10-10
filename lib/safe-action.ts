import { auth } from "@/auth"
import { getAuthUserState, getOrganizationSuspension } from "@/lib/data/auth"
import { isRateLimitOutage, rateLimit, rateLimiters } from "@/lib/rate-limit"
import { logError } from "@/lib/logger"
import { ApiError, UpgradeRequiredError, type UpgradeRequiredDetails } from "@/lib/api-error-utils"
import { Prisma } from "@prisma/client"
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

/**
 * Map a handler error to a user-facing ActionState. The app's typed ApiError
 * subclasses (ValidationError, ConflictError, ForbiddenError, NotFoundError,
 * UpgradeRequiredError, ...) carry deliberately user-facing messages; known
 * Prisma races map to generic text; anything else is logged and hidden.
 */
function actionErrorState(scope: string, error: unknown): ActionState<never> {
  if (error instanceof UpgradeRequiredError) {
    return {
      error: error.message,
      code: error.code,
      upgrade: error.details,
    }
  }
  if (error instanceof ApiError) {
    if (error.statusCode >= 500) {
      logError(scope, "Operation failed", error)
    }
    return error.code ? { error: error.message, code: error.code } : { error: error.message }
  }
  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2002") {
      return { error: "That already exists" }
    }
    if (error.code === "P2034") {
      return { error: "Please try again" }
    }
  }
  logError(scope, "Operation failed", error)
  return { error: "Operation failed" }
}

function rateLimitedActionMessage(limited: Response): string {
  return isRateLimitOutage(limited)
    ? "This is temporarily unavailable. Please try again shortly."
    : "Too many requests. Please try again later."
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

  // Admin is 2FA-enforced: an admin must have 2FA enrolled AND verified for
  // this session, not merely "not mid-challenge".
  if (!session.user.twoFactorEnabled || requiresTwoFactorChallenge(session)) {
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
    return actionErrorState("AdminAction", error)
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
      return { error: rateLimitedActionMessage(limited) }
    }
  }

  const parsed = parseActionData(options.schema, options.data)
  if ("error" in parsed) return { error: parsed.error }
  const validatedData = parsed.data

  try {
    const result = await handler(validatedData, userId)
    return { success: true, data: result ?? undefined }
  } catch (error) {
    return actionErrorState("SecureAction", error)
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

  // Staff suspension: a frozen org cannot perform org-scoped writes.
  if (scope.organizationId) {
    const { suspended } = await getOrganizationSuspension(scope.organizationId)
    if (suspended) {
      return { error: "This organization has been suspended. Please contact support." }
    }
  }

  if (options.rateLimitKey) {
    const limited = await rateLimit(options.rateLimitKey, userId)
    if (limited) {
      return { error: rateLimitedActionMessage(limited) }
    }
  }

  const parsed = parseActionData(options.schema, options.data)
  if ("error" in parsed) return { error: parsed.error }
  const validatedData = parsed.data

  try {
    const result = await handler(validatedData, scope)
    return { success: true, data: result ?? undefined }
  } catch (error) {
    return actionErrorState("ScopedAction", error)
  }
}
