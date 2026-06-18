import { prisma } from "@/lib/prisma"
import type { SubscriptionLike } from "@/lib/limits"

interface AuthUserState {
    id: string
    isAdmin: boolean
    banned: boolean
    twoFactorEnabled: boolean
    subscriptions: SubscriptionLike[]
    referralPlusUntil: Date | null
    memberships: { organizationId: string; role: string; enforce2FA: boolean }[]
}

interface AuthApiKeyRecord {
    id: string
    user: Pick<AuthUserState, "id" | "banned" | "subscriptions" | "referralPlusUntil">
    // Org-owned keys (organizationId set) meter quota against the org and resolve
    // tier from the org's subscriptions (Track G). null = personal key.
    organizationId: string | null
    organizationSubscriptions: SubscriptionLike[] | null
}

const ACTIVE_SUBSCRIPTION_SELECT = {
    where: { status: { in: ["active", "trialing"] } },
    select: {
        status: true,
        product: true,
        tier: true,
        currentPeriodEnd: true,
    },
}

/**
 * Active subscriptions owned by an organization. Used to derive ORG-scope
 * resource limits from the org's own plan (e.g. Business), independent of any
 * single member's personal plan. Returns a UserSub-shaped context (no personal
 * referral perk) so getPlanLimits/getDropLimits/etc. yield the org's allowances.
 */
export async function getOrgLimitContext(organizationId: string): Promise<{ subscriptions: SubscriptionLike[]; referralPlusUntil: null }> {
    const subscriptions = await prisma.subscription.findMany({
        where: { organizationId, status: { in: ["active", "trialing"] } },
        select: ACTIVE_SUBSCRIPTION_SELECT.select,
    })
    return { subscriptions, referralPlusUntil: null }
}

/**
 * Whether an org has an active Business subscription. Purchase-first Teams: an
 * unsubscribed org is a zero-capacity workspace, so the dashboard create pages
 * use this to show a "subscribe to unlock" state. Keyed on the SAME active-sub
 * query as getOrgLimitContext, so the UI gate and the server enforcement
 * (assertOrgPlanActive) agree exactly.
 */
export async function isOrgSubscribed(organizationId: string): Promise<boolean> {
    const sub = await prisma.subscription.findFirst({
        where: { organizationId, status: { in: ["active", "trialing"] } },
        select: { id: true },
    })
    return Boolean(sub)
}

/**
 * Staff-suspension state for an organization. When `suspended` is true the org
 * is frozen: runScopedAction rejects org-scoped writes and the dashboard shows a
 * banner. Set only by the admin panel (AdminService.suspendOrganization).
 */
export async function getOrganizationSuspension(
    organizationId: string,
): Promise<{ suspended: boolean; reason: string | null }> {
    const org = await prisma.organization.findUnique({
        where: { id: organizationId },
        select: { suspendedAt: true, suspendedReason: true },
    })
    return { suspended: Boolean(org?.suspendedAt), reason: org?.suspendedReason ?? null }
}

export async function getAuthUserState(userId: string): Promise<AuthUserState | null> {
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            id: true,
            isAdmin: true,
            banned: true,
            twoFactorEnabled: true,
            referralPlusUntil: true,
            subscriptions: ACTIVE_SUBSCRIPTION_SELECT,
            memberships: {
                select: {
                    organizationId: true,
                    role: true,
                    // Org-wide 2FA enforcement policy, surfaced on the session so
                    // org-scoped gates can require 2FA (lib/access-policy.ts).
                    organization: { select: { enforce2FA: true } },
                },
            },
            deletionRequest: {
                select: { id: true },
            },
        },
    })

    if (!user || user.deletionRequest) {
        return null
    }

    const { deletionRequest: _deletionRequest, memberships, ...rest } = user
    const authUser: AuthUserState = {
        ...rest,
        // Flatten the org's enforce2FA onto each membership.
        memberships: memberships.map((m) => ({
            organizationId: m.organizationId,
            role: m.role,
            enforce2FA: m.organization?.enforce2FA ?? false,
        })),
    }

    // Seat-based entitlements: a member inherits the active subscriptions of the
    // orgs they belong to (e.g. a team's Business plan). One extra query, and
    // only when the user is actually in an org.
    const orgIds = authUser.memberships.map((m) => m.organizationId)
    if (orgIds.length > 0) {
        const orgSubscriptions = await prisma.subscription.findMany({
            where: {
                organizationId: { in: orgIds },
                status: { in: ["active", "trialing"] },
            },
            select: ACTIVE_SUBSCRIPTION_SELECT.select,
        })
        authUser.subscriptions = [...authUser.subscriptions, ...orgSubscriptions]
    }

    return authUser
}

export async function getAuthApiKeyRecord(keyHash: string): Promise<(AuthApiKeyRecord & { expiresAt: Date | null }) | null> {
    const apiKey = await prisma.apiKey.findUnique({
        where: { keyHash },
        select: {
            id: true,
            expiresAt: true,
            organizationId: true,
            organization: { select: { subscriptions: ACTIVE_SUBSCRIPTION_SELECT } },
            user: {
                select: {
                    id: true,
                    banned: true,
                    referralPlusUntil: true,
                    subscriptions: ACTIVE_SUBSCRIPTION_SELECT,
                    deletionRequest: {
                        select: { id: true },
                    },
                },
            },
        },
    })

    if (!apiKey || apiKey.user.deletionRequest) {
        return null
    }

    const { deletionRequest: _deletionRequest, ...user } = apiKey.user
    return {
        id: apiKey.id,
        expiresAt: apiKey.expiresAt,
        organizationId: apiKey.organizationId,
        organizationSubscriptions: apiKey.organization?.subscriptions ?? null,
        user,
    }
}

export async function touchApiKeyLastUsed(apiKeyId: string): Promise<void> {
    await prisma.apiKey.update({
        where: { id: apiKeyId },
        data: { lastUsedAt: new Date() },
    })
}
