import { cache } from "react"
import { auth } from "@/lib/auth"
import { getAuthUserState } from "@/lib/data/auth"
import { isOrgRole, type OrgRole } from "@/lib/auth-permissions"
import { headers } from "next/headers"

interface AppSession {
    user: {
        id: string
        name?: string | null
        email?: string | null
        image?: string | null
        isAdmin: boolean
        twoFactorEnabled: boolean
    }
    twoFactorVerified: boolean
    // Active organization context (B2B). Null = personal context.
    activeOrganizationId: string | null
    activeOrgRole: OrgRole | null
}

async function getSessionInternal(): Promise<AppSession | null> {
    // headers() opts into dynamic rendering — must be called before any
    // early return so Next.js never statically pre-renders auth-gated pages.
    const h = await headers()

    if (process.env.NEXT_PHASE === "phase-production-build") return null

    const result = await auth.api.getSession({ headers: h })
    if (!result?.user) return null
    const authUser = await getAuthUserState(result.user.id)
    if (!authUser) return null

    // Resolve the active organization from the better-auth session, but only
    // trust it if the user is still a member — this defends against a stale
    // activeOrganizationId left on the session after the user was removed from
    // the org. Otherwise fall back to personal context.
    // better-auth's inferred session type doesn't surface the organization
    // plugin's session columns, but they are present on the row at runtime.
    const sessionWithOrg = result.session as typeof result.session & {
        activeOrganizationId?: string | null
    }
    const sessionActiveOrgId = sessionWithOrg.activeOrganizationId ?? null
    const activeMembership = sessionActiveOrgId
        ? (authUser.memberships.find((m) => m.organizationId === sessionActiveOrgId) ?? null)
        : null
    const activeOrganizationId = activeMembership ? sessionActiveOrgId : null
    const activeOrgRole =
        activeMembership && isOrgRole(activeMembership.role) ? activeMembership.role : null

    return {
        user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            image: result.user.image,
            isAdmin: authUser.isAdmin,
            twoFactorEnabled: authUser.twoFactorEnabled,
        },
        twoFactorVerified: result.session.twoFactorVerified ?? false,
        activeOrganizationId,
        activeOrgRole,
    }
}

export const getSession = cache(getSessionInternal)
