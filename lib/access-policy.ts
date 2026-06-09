/**
 * Centralized access-policy evaluation.
 *
 * This owns the canonical 2FA-challenge predicate so the
 * `twoFactorEnabled && !twoFactorVerified` check lives in exactly one place
 * (it was previously duplicated across safe-action, route-policy, api-auth,
 * vault/server, and several layouts). It is also the intended home for
 * org-wide security policy (enforce2FA, ssoOnly) as those are rolled across the
 * remaining gates — keeping the rule centralized means org enforcement applies
 * everywhere at once rather than requiring ~10 separate edits.
 */

export interface TwoFactorState {
    user: { twoFactorEnabled: boolean }
    twoFactorVerified: boolean
}

/** True when the session must complete a 2FA challenge before proceeding. */
export function requiresTwoFactorChallenge(session: TwoFactorState): boolean {
    return session.user.twoFactorEnabled && !session.twoFactorVerified
}
