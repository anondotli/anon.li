/**
 * Client-side analytics event tracking via PostHog.
 * Safe to call server-side (no-ops gracefully).
 */

import posthog from "posthog-js"

function trackEvent(event: string, data?: Record<string, string | number>) {
    if (typeof window === "undefined") return
    if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
    posthog.capture(event, data)
}

// ─── Funnel events ─────────────────────────────────────────────────────

export const analytics = {
    /** Drop: user started an upload */
    dropUploadStarted: (fileCount: number) =>
        trackEvent("drop_upload_started", { file_count: fileCount }),

    /** Drop: upload completed successfully */
    dropUploadCompleted: () =>
        trackEvent("drop_upload_completed"),

    /** Drop: share link copied */
    dropShareLinkCopied: () =>
        trackEvent("drop_share_link_copied"),

    /** Alias: first alias created */
    aliasCreated: (format: string) =>
        trackEvent("alias_created", { format }),

    /** Alias: custom domain connected */
    aliasDomainConnected: () =>
        trackEvent("alias_domain_connected"),

    /** Billing: upgrade button clicked */
    upgradeClicked: (product: string, tier: string) =>
        trackEvent("upgrade_clicked", { product, tier }),

    /** Billing: checkout started */
    checkoutStarted: (product: string, tier: string, frequency: string) =>
        trackEvent("checkout_started", { product, tier, frequency }),

    /**
     * Billing: checkout completed — fired on the success-return page. Measured
     * client-side (like checkout_started) so the start→complete funnel ratio is
     * apples-to-apples. `method` is "card" or "crypto".
     */
    checkoutCompleted: (method: string) =>
        trackEvent("checkout_completed", { method }),

    /** Auth: registration started */
    registrationStarted: (method: string) =>
        trackEvent("registration_started", { method }),

    /** Auth: login started (magic link sent or social redirect initiated) */
    loginStarted: (method: string) =>
        trackEvent("login_started", { method }),

    /** Referral: invite link copied from the dashboard banner */
    referralLinkCopied: (source: string) =>
        trackEvent("referral_link_copied", { source }),
}
