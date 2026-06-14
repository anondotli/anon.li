import { ForbiddenError, NotFoundError } from "@/lib/api-error-utils"
import type { OrgRole } from "@/lib/auth-permissions"

/**
 * OwnerScope — the single source of truth for "who is acting, and in what
 * tenancy context" when touching an owned resource (alias, recipient, domain,
 * drop, form, api key, subscription).
 *
 * A scope is either PERSONAL (the user's own resources; organizationId === null)
 * or ORGANIZATION (a member acting within an org, carrying their role). It is
 * resolved exactly once at the trust boundary (runScopedAction in
 * lib/safe-action.ts and withPolicy in lib/route-policy.ts) and threaded into
 * the service layer, so the tenancy decision lives in one place.
 *
 * SECURITY: this is the cross-tenant isolation boundary. `ownerWhere()` scopes
 * queries so out-of-scope rows are never selected; `assertCanAccess()` guards
 * rows that were already loaded. Every owned-resource read/mutation must pass
 * through one of them — a single missed conversion is a cross-tenant data leak.
 */
export type { OrgRole }

export interface OwnerScope {
    /** The acting user — always present, since org actions are still performed by a user. */
    userId: string
    /** The active organization id, or null for a personal-context action. */
    organizationId: string | null
    /** The acting user's role in the active org, or null in personal context. */
    role: OrgRole | null
}

/** Shape of any row that can be owned by a user and/or an organization. */
export interface Ownable {
    userId: string | null
    organizationId: string | null
}

const ROLE_RANK: Record<OrgRole, number> = { member: 1, admin: 2, owner: 3 }

export function personalScope(userId: string): OwnerScope {
    return { userId, organizationId: null, role: null }
}

export function orgScope(userId: string, organizationId: string, role: OrgRole): OwnerScope {
    return { userId, organizationId, role }
}

export function isOrgScope(
    scope: OwnerScope,
): scope is OwnerScope & { organizationId: string; role: OrgRole } {
    return scope.organizationId !== null
}

/**
 * Prisma `where` fragment restricting a query to resources visible in this scope.
 * Spread into a findFirst/findMany/updateMany/deleteMany where clause:
 *
 *   prisma.alias.findFirst({ where: { id, ...ownerWhere(scope) } })
 *
 * - Org scope  → { organizationId }            (any resource owned by the active org)
 * - Personal   → { userId, organizationId: null } (personal resources only — never the
 *                 user's org-owned resources, which require an org scope to reach)
 */
export function ownerWhere(
    scope: OwnerScope,
): { organizationId: string } | { userId: string; organizationId: null } {
    if (isOrgScope(scope)) {
        return { organizationId: scope.organizationId }
    }
    return { userId: scope.userId, organizationId: null }
}

/**
 * Assert that an already-loaded row is accessible in this scope, and optionally
 * that the caller's org role meets a minimum.
 *
 * Throws NotFoundError when the row is out of scope — we 404 rather than 403 so
 * a tenant can't probe the existence of another tenant's resources. Throws
 * ForbiddenError when the row is in scope but the caller's role is insufficient.
 */
/** Boolean tenancy check: is the resource visible within this scope? */
export function isWithinScope(resource: Ownable, scope: OwnerScope): boolean {
    return isOrgScope(scope)
        ? resource.organizationId === scope.organizationId
        : resource.organizationId === null && resource.userId === scope.userId
}

export function assertCanAccess(
    resource: Ownable,
    scope: OwnerScope,
    opts?: { minRole?: OrgRole },
): void {
    if (!isWithinScope(resource, scope)) {
        throw new NotFoundError()
    }

    if (opts?.minRole) {
        if (!isOrgScope(scope)) {
            throw new ForbiddenError("This action requires an organization role")
        }
        if (ROLE_RANK[scope.role] < ROLE_RANK[opts.minRole]) {
            throw new ForbiddenError("Insufficient organization role")
        }
    }
}

/** True when an org role meets or exceeds a minimum (member < admin < owner). */
export function meetsMinRole(role: OrgRole | null, minRole: OrgRole): boolean {
    return role !== null && ROLE_RANK[role] >= ROLE_RANK[minRole]
}

/**
 * Assert tenancy (like assertCanAccess) AND, when acting in an ORGANIZATION
 * context, a minimum role. In PERSONAL context the role gate is skipped — a user
 * owns their own resources outright. This is the org-RBAC gate for destructive /
 * management operations (delete, disable) where a plain `member` must not act on
 * shared org resources, but a personal user always can on their own.
 *
 * Throws NotFoundError when out of scope (don't leak existence), ForbiddenError
 * when in scope but the org role is insufficient. Default minRole is `admin`.
 */
export function assertCanManage(
    resource: Ownable,
    scope: OwnerScope,
    minRole: OrgRole = "admin",
): void {
    if (!isWithinScope(resource, scope)) {
        throw new NotFoundError()
    }
    if (isOrgScope(scope) && ROLE_RANK[scope.role] < ROLE_RANK[minRole]) {
        throw new ForbiddenError("Insufficient organization role")
    }
}
