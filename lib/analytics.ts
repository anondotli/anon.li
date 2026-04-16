/**
 * Client-side analytics event tracking via Umami.
 * Safe to call server-side (no-ops gracefully).
 */

declare global {
    interface Window {
        umami?: {
            track: (event: string, data?: Record<string, string | number>) => void
        }
    }
}

function trackEvent(event: string, data?: Record<string, string | number>) {
    if (typeof window !== "undefined" && window.umami) {
        if (data) {
            window.umami.track(event, data)
            return
        }

        window.umami.track(event)
    }
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

    /** Auth: registration started */
    registrationStarted: (method: string) =>
        trackEvent("registration_started", { method }),

    /** Auth: login started (magic link sent or social redirect initiated) */
    loginStarted: (method: string) =>
        trackEvent("login_started", { method }),
}
