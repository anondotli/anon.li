import { PLAN_ENTITLEMENTS } from "@/config/plans"

export type FeaturePriority = "primary" | "secondary" | "tertiary"
export type FeatureProduct = "alias" | "drop" | "trust" | "developer"

export interface FeaturePresentation {
    id: string
    product: FeatureProduct
    priority: FeaturePriority
    title: string
    shortTitle: string
    description: string
    href: string
    claimIds?: string[]
}

const formatGb = (bytes: number) => `${bytes / (1024 * 1024 * 1024)}GB`

export const DROP_PRO_LIMIT_LABELS = {
    maxFileSize: `Up to ${formatGb(PLAN_ENTITLEMENTS.drop.pro.maxFileSize)} files`,
    bandwidth: `Up to ${formatGb(PLAN_ENTITLEMENTS.drop.pro.bandwidth)}/mo`,
    expiry: `Up to ${PLAN_ENTITLEMENTS.drop.pro.maxExpiryDays}-day expiry`,
} as const

export const FEATURE_CATALOG = [
    {
        id: "alias_private_aliases",
        product: "alias",
        priority: "primary",
        title: "Private Email Aliases",
        shortTitle: "Private aliases",
        description: "Create random or custom addresses for every signup so your real inbox stays private.",
        href: "/alias#features",
    },
    {
        id: "alias_reply_privately",
        product: "alias",
        priority: "primary",
        title: "Reply by Alias",
        shortTitle: "Private replies",
        description: "Reply to forwarded messages through your alias without exposing your real address.",
        href: "/alias#how-it-works",
        claimIds: ["alias_anonymous_replies"],
    },
    {
        id: "alias_pause_block",
        product: "alias",
        priority: "primary",
        title: "Instant Spam Control",
        shortTitle: "Pause spam",
        description: "Pause or delete an alias the moment it starts receiving unwanted mail.",
        href: "/alias#features",
    },
    {
        id: "alias_custom_domains",
        product: "alias",
        priority: "secondary",
        title: "Custom Domains",
        shortTitle: "Custom domains",
        description: "Use your own domain for professional aliases with DNS verification and DKIM signing.",
        href: "/dashboard/domains",
        claimIds: ["alias_dkim_spf_dmarc"],
    },
    {
        id: "alias_recipients",
        product: "alias",
        priority: "secondary",
        title: "Verified Recipients",
        shortTitle: "Recipients",
        description: "Route aliases to verified inboxes and send one alias to multiple recipients on paid plans.",
        href: "/dashboard/alias/recipients",
    },
    {
        id: "alias_pgp_forwarding",
        product: "alias",
        priority: "secondary",
        title: "Optional PGP Forwarding",
        shortTitle: "PGP forwarding",
        description: "Encrypt delivered copies for recipients that have a public key configured.",
        href: "/docs/security#pgp-encryption",
        claimIds: ["alias_pgp"],
    },
    {
        id: "alias_encrypted_metadata",
        product: "alias",
        priority: "secondary",
        title: "Encrypted Labels and Notes",
        shortTitle: "Encrypted notes",
        description: "Organize aliases with vault-encrypted labels and notes that stay readable only after unlock.",
        href: "/docs/security#magic-links-and-password-protected-vault-access",
    },
    {
        id: "alias_usage_stats",
        product: "alias",
        priority: "secondary",
        title: "Usage and Activity Stats",
        shortTitle: "Usage stats",
        description: "See alias counts, blocked mail, last activity, and plan usage from the dashboard.",
        href: "/dashboard/usage",
    },
    {
        id: "drop_browser_encryption",
        product: "drop",
        priority: "primary",
        title: "Browser-Side Encryption",
        shortTitle: "E2EE uploads",
        description: "Files are encrypted in your browser with AES-256-GCM before upload.",
        href: "/drop#features",
        claimIds: ["drop_client_side_encryption", "drop_aes256gcm"],
    },
    {
        id: "drop_zero_knowledge_links",
        product: "drop",
        priority: "primary",
        title: "Zero-Knowledge Share Links",
        shortTitle: "Zero-knowledge links",
        description: "Keys stay in the URL fragment or behind your password, so the server cannot read file contents.",
        href: "/security",
        claimIds: ["drop_zero_knowledge"],
    },
    {
        id: "drop_no_account_download",
        product: "drop",
        priority: "primary",
        title: "No Account to Download",
        shortTitle: "Recipient-friendly",
        description: "Recipients open the link and decrypt in their browser without creating an account.",
        href: "/drop#how-it-works",
    },
    {
        id: "drop_large_uploads",
        product: "drop",
        priority: "secondary",
        title: "Large Multi-File Uploads",
        shortTitle: "Large uploads",
        description: `${DROP_PRO_LIMIT_LABELS.maxFileSize} with chunked uploads and multi-file drops.`,
        href: "/pricing?drop",
        claimIds: ["drop_max_file_size"],
    },
    {
        id: "drop_password_protection",
        product: "drop",
        priority: "secondary",
        title: "Password Protection",
        shortTitle: "Passwords",
        description: "Require a separate password so recipients need both the link and password to decrypt.",
        href: "/drop#features",
        claimIds: ["drop_argon2id"],
    },
    {
        id: "drop_expiry_download_limits",
        product: "drop",
        priority: "secondary",
        title: "Expiry and Download Limits",
        shortTitle: "Expiry and limits",
        description: "Set auto-delete dates and download caps for each shared drop.",
        href: "/drop#features",
        claimIds: ["download_limit_enforcement"],
    },
    {
        id: "drop_link_controls",
        product: "drop",
        priority: "secondary",
        title: "Link Disable and Re-Enable",
        shortTitle: "Link controls",
        description: "Turn download links off or back on from the dashboard without deleting the drop.",
        href: "/dashboard/drop",
    },
    {
        id: "drop_qr_sharing",
        product: "drop",
        priority: "secondary",
        title: "QR Code Sharing",
        shortTitle: "QR sharing",
        description: "Share encrypted links as QR codes when copying a URL is inconvenient.",
        href: "/dashboard/drop",
    },
    {
        id: "drop_vault_recovery",
        product: "drop",
        priority: "secondary",
        title: "Vault-Backed Owner Keys",
        shortTitle: "Key recovery",
        description: "Store wrapped owner keys in your vault so dashboard links can be recovered after upload.",
        href: "/docs/api/drop#vault-unlock-for-api-clients",
    },
    {
        id: "drop_download_notifications",
        product: "drop",
        priority: "secondary",
        title: "Download Notifications",
        shortTitle: "Notifications",
        description: "Get notified when someone downloads a Pro drop.",
        href: "/pricing?drop",
    },
    {
        id: "drop_no_branding",
        product: "drop",
        priority: "secondary",
        title: "Remove Branding",
        shortTitle: "No branding",
        description: "Remove anon.li branding from download pages on Pro.",
        href: "/pricing?drop",
    },
    {
        id: "trust_open_source",
        product: "trust",
        priority: "primary",
        title: "Open Source",
        shortTitle: "Open source",
        description: "Inspect the application source and verify security-sensitive behavior.",
        href: "/security#claim-transparency",
        claimIds: ["open_source"],
    },
    {
        id: "trust_claim_transparency",
        product: "trust",
        priority: "primary",
        title: "Claim Transparency",
        shortTitle: "Claim checks",
        description: "Security claims are classified by whether they are source-verifiable or infrastructure-dependent.",
        href: "/security#claim-transparency",
    },
    {
        id: "trust_two_factor",
        product: "trust",
        priority: "secondary",
        title: "Two-Factor Authentication",
        shortTitle: "2FA",
        description: "Protect your account with standard TOTP-based two-factor authentication.",
        href: "/security#two-factor-authentication-totp",
        claimIds: ["totp_2fa"],
    },
    {
        id: "trust_data_control",
        product: "trust",
        priority: "secondary",
        title: "Export and Delete",
        shortTitle: "Data control",
        description: "Export your data and delete your account from dashboard settings.",
        href: "/dashboard/settings",
    },
    {
        id: "developer_rest_api",
        product: "developer",
        priority: "tertiary",
        title: "REST API",
        shortTitle: "API",
        description: "Automate aliases, recipients, domains, and encrypted drops with API keys.",
        href: "/docs/api",
    },
    {
        id: "developer_cli",
        product: "developer",
        priority: "tertiary",
        title: "Command-Line Tool",
        shortTitle: "CLI",
        description: "Manage aliases, drops, domains, recipients, and subscriptions from your terminal.",
        href: "/cli",
    },
    {
        id: "developer_extension",
        product: "developer",
        priority: "tertiary",
        title: "Browser Extension",
        shortTitle: "Extension",
        description: "Generate aliases, manage drops, share QR codes, and use keyboard shortcuts in the browser.",
        href: "/extension",
    },
    {
        id: "developer_mcp",
        product: "developer",
        priority: "tertiary",
        title: "MCP Server",
        shortTitle: "MCP",
        description: "Connect AI tools through OAuth so they can manage aliases, recipients, and drop metadata safely.",
        href: "/mcp",
    },
] as const satisfies readonly FeaturePresentation[]

export const IMPORTANT_FEATURE_IDS = [
    "alias_private_aliases",
    "alias_reply_privately",
    "alias_pause_block",
    "drop_browser_encryption",
    "drop_zero_knowledge_links",
    "drop_no_account_download",
    "trust_open_source",
    "trust_claim_transparency",
] as const

export const DASHBOARD_FEATURE_PROMPTS = {
    alias: [
        "alias_recipients",
        "alias_custom_domains",
        "alias_pgp_forwarding",
        "alias_encrypted_metadata",
    ],
    drop: [
        "drop_password_protection",
        "drop_expiry_download_limits",
        "drop_link_controls",
        "drop_qr_sharing",
    ],
    developer: [
        "developer_rest_api",
        "developer_cli",
        "developer_extension",
        "developer_mcp",
    ],
} as const

export function getFeatureById(id: string): FeaturePresentation | undefined {
    return FEATURE_CATALOG.find((feature) => feature.id === id)
}

export function getFeaturesByIds(ids: readonly string[]): FeaturePresentation[] {
    return ids
        .map((id) => getFeatureById(id))
        .filter((feature): feature is FeaturePresentation => Boolean(feature))
}

export function getFeaturesByProduct(product: FeatureProduct): FeaturePresentation[] {
    return FEATURE_CATALOG.filter((feature) => feature.product === product)
}

export function getFeaturesByPriority(priority: FeaturePriority): FeaturePresentation[] {
    return FEATURE_CATALOG.filter((feature) => feature.priority === priority)
}
