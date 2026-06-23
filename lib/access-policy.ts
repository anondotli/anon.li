/**
 * Centralized access-policy evaluation.
 *
 * This owns the canonical 2FA-challenge predicate so the
 * `twoFactorEnabled && !twoFactorVerified` check lives in exactly one place
 * (it was previously duplicated across safe-action, route-policy, api-auth,
 * vault/server, and several layouts). It also owns org-wide 2FA enforcement so
 * the rule is applied consistently everywhere org-scoped work happens.
 */

export interface TwoFactorState {
    user: { twoFactorEnabled: boolean }
    twoFactorVerified: boolean
}

/** True when the session must complete a 2FA challenge before proceeding. */
export function requiresTwoFactorChallenge(session: TwoFactorState): boolean {
    return session.user.twoFactorEnabled && !session.twoFactorVerified
}

export interface OrgTwoFactorState extends TwoFactorState {
    activeOrgEnforce2FA: boolean
}

/**
 * True when the active org REQUIRES two-factor but the user hasn't enrolled it
 * at all. Distinct from requiresTwoFactorChallenge (enrolled-but-not-verified):
 * here the user must first set up 2FA before they can act in the org context.
 */
export function orgRequiresTwoFactorSetup(session: OrgTwoFactorState): boolean {
    return session.activeOrgEnforce2FA && !session.user.twoFactorEnabled
}