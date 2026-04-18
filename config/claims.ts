/**
 * Trust Claims Registry
 *
 * Single source of truth for all public claims made in marketing, docs,
 * legal, and comparison pages. Each claim is classified by verifiability.
 *
 * Classification:
 * - verified_in_repo: Can be evidenced from our published source code,
 *   including companion repositories referenced in verificationPath
 * - depends_on_external_infra: True claim, but proof requires inspecting
 *   runtime systems (deployment config, retention policy, etc.)
 * - marketing_only: Positioning/messaging copy, not a factual claim
 */

export type ClaimClass = "verified_in_repo" | "depends_on_external_infra" | "marketing_only"

export type ClaimCategory =
    | "cryptography"
    | "email"
    | "infrastructure"
    | "access_control"
    | "positioning"

export interface Claim {
    id: string
    statement: string
    class: ClaimClass
    /** File path or URL where this claim can be verified */
    verificationPath?: string
    /** Qualifications on the claim */
    caveats?: string[]
    appliesTo: ("alias" | "drop" | "both")[]
    /** Grouping for display and filtering */
    category?: ClaimCategory
    /** Compact label for trust indicator bars */
    shortLabel?: string
    /** ISO date when the claim was last verified against its source */
    lastVerified?: string
    /** URL or reference for external verification */
    sourceUrl?: string
}

export const VERIFICATION_CLASS_META: Record<ClaimClass, { label: string; description: string }> = {
    verified_in_repo: {
        label: "Verified in source",
        description: "This claim is supported by code or configuration in our published source repositories.",
    },
    depends_on_external_infra: {
        label: "Depends on infrastructure",
        description: "This claim depends on runtime configuration or the deployed service, not just the published source.",
    },
    marketing_only: {
        label: "Positioning copy",
        description: "This is messaging rather than a directly testable factual claim.",
    },
}

export const CLAIMS: Claim[] = [
    // ─── Cryptography (verified in repo) ────────────────────────────────

    {
        id: "drop_e2e_encryption",
        statement: "End-to-end encrypted",
        shortLabel: "Encrypted",
        class: "verified_in_repo",
        category: "cryptography",
        verificationPath: "lib/crypto.client.ts",
        lastVerified: "2026-04-05",
        appliesTo: ["drop"],
    },
    {
        id: "drop_aes256gcm",
        statement: "AES-256-GCM encryption",
        class: "verified_in_repo",
        category: "cryptography",
        verificationPath: "lib/crypto.client.ts",
        lastVerified: "2026-04-05",
        appliesTo: ["drop"],
    },
    {
        id: "drop_zero_knowledge",
        statement: "Zero-knowledge file sharing",
        shortLabel: "Zero Knowledge",
        class: "verified_in_repo",
        category: "cryptography",
        verificationPath: "lib/crypto.client.ts",
        lastVerified: "2026-04-05",
        caveats: [
            "Server sees metadata: file size, creation time, download count, IP addresses",
            "Encryption key is in the URL fragment, not sent to server",
        ],
        appliesTo: ["drop"],
    },
    {
        id: "drop_client_side_encryption",
        statement: "Files encrypted in your browser before upload",
        class: "verified_in_repo",
        category: "cryptography",
        verificationPath: "components/drop/file-uploader.tsx",
        lastVerified: "2026-04-05",
        appliesTo: ["drop"],
    },
    {
        id: "drop_argon2id",
        statement: "Argon2id key derivation for password-protected drops",
        class: "verified_in_repo",
        category: "cryptography",
        verificationPath: "lib/crypto.client.ts",
        lastVerified: "2026-04-05",
        appliesTo: ["drop"],
    },
    {
        id: "drop_webcrypto",
        statement: "Web Crypto API for all browser-side cryptography",
        class: "verified_in_repo",
        category: "cryptography",
        verificationPath: "lib/crypto.client.ts",
        lastVerified: "2026-04-05",
        appliesTo: ["drop"],
    },

    // ─── Email ──────────────────────────────

    {
        id: "alias_no_email_storage",
        statement: "Alias forwards mail instead of hosting mailbox storage",
        class: "depends_on_external_infra",
        category: "email",
        lastVerified: "2026-04-04",
        sourceUrl: "https://codeberg.org/anonli/mx/src/branch/main/plugins/queue.forward.js",
        caveats: [
            "Messages are still processed server-side during delivery",
            "The Haraka mail server may queue messages transiently before final delivery",
        ],
        appliesTo: ["alias"],
    },
    {
        id: "alias_pgp",
        statement: "Optional PGP encryption for forwarded copies",
        shortLabel: "PGP Encryption",
        class: "depends_on_external_infra",
        category: "email",
        lastVerified: "2026-04-04",
        sourceUrl: "https://codeberg.org/anonli/mx/src/branch/main/plugins/queue.forward.js",
        caveats: [
            "Applied when the destination recipient has a public key configured",
            "If PGP/MIME generation fails, forwarding falls back to an unencrypted copy",
        ],
        appliesTo: ["alias"],
    },
    {
        id: "alias_dkim_spf_dmarc",
        statement: "DKIM, SPF, and DMARC support",
        class: "depends_on_external_infra",
        category: "email",
        lastVerified: "2026-04-04",
        sourceUrl: "https://codeberg.org/anonli/mx/src/branch/main/config/plugins",
        caveats: [
            "Custom domains still require correct DNS records for deliverability",
        ],
        appliesTo: ["alias"],
    },
    {
        id: "alias_anonymous_replies",
        statement: "Reply to forwarded emails using your alias address",
        class: "depends_on_external_infra",
        category: "email",
        lastVerified: "2026-04-04",
        sourceUrl: "https://codeberg.org/anonli/mx/src/branch/main/plugins/rcpt_to.reply.js",
        caveats: [
            "Reply tokens are cryptographically validated and expire after 7 days",
        ],
        appliesTo: ["alias"],
    },
    {
        id: "alias_zero_tracking",
        statement: "Known tracking pixels and tracking parameters are stripped from forwarded HTML emails",
        shortLabel: "Tracking Removal",
        class: "depends_on_external_infra",
        category: "email",
        lastVerified: "2026-04-04",
        sourceUrl: "https://codeberg.org/anonli/mx/src/branch/main/plugins/data.tracking_remove.js",
        caveats: [
            "Targets known tracking domains, 1x1 pixels, and common URL parameters",
            "Not a guarantee against every possible tracker or remote-image technique",
            "Web analytics use cookie-free Umami but still collect aggregate page views",
        ],
        appliesTo: ["alias"],
    },

    // ─── Infrastructure (depends on external infra) ─────────────────────

    {
        id: "open_source",
        statement: "Open source",
        shortLabel: "Open Source",
        class: "verified_in_repo",
        category: "infrastructure",
        verificationPath: "LICENSE",
        lastVerified: "2026-04-04",
        sourceUrl: "https://codeberg.org/anonli/anon.li",
        caveats: [
            "The web application is AGPL-3.0-only; the companion mail server is published separately under MIT",
            "Users must trust the deployment matches the published source",
        ],
        appliesTo: ["both"],
    },
    {
        id: "logs_auto_deleted",
        statement: "Logs auto-deleted after 7 days",
        class: "depends_on_external_infra",
        category: "infrastructure",
        lastVerified: "2026-04-05",
        sourceUrl: "https://codeberg.org/anonli/anon.li/src/branch/main/content/docs/security.mdx",
        caveats: [
            "Log retention is configured at the infrastructure level, not in this codebase",
        ],
        appliesTo: ["both"],
    },

    // ─── Access control (verified in repo) ──────────────────────────────

    {
        id: "magic_link_and_password_auth",
        statement: "Magic-link verification and password-based sign-in for vault-enabled accounts",
        class: "verified_in_repo",
        category: "access_control",
        verificationPath: "lib/auth.ts",
        lastVerified: "2026-04-15",
        caveats: [
            "Password resets revoke sessions and invalidate saved local browser trust by removing vault materials",
        ],
        appliesTo: ["both"],
    },
    {
        id: "totp_2fa",
        statement: "TOTP two-factor authentication",
        class: "verified_in_repo",
        category: "access_control",
        verificationPath: "lib/auth.ts",
        lastVerified: "2026-04-05",
        appliesTo: ["both"],
    },
    {
        id: "download_limit_enforcement",
        statement: "Atomic download limit enforcement for downloads and previews",
        class: "verified_in_repo",
        category: "access_control",
        verificationPath: "lib/services/drop.ts",
        lastVerified: "2026-04-16",
        appliesTo: ["drop"],
    },
    {
        id: "rate_limiting",
        statement: "Rate limiting on public API and sensitive endpoints",
        class: "verified_in_repo",
        category: "access_control",
        verificationPath: "lib/rate-limit.ts",
        lastVerified: "2026-04-16",
        caveats: [
            "Applied per-route; internal and public endpoints use different limiters based on risk",
        ],
        appliesTo: ["both"],
    },

    // ─── Marketing positioning ──────────────────────────────────────────

    {
        id: "privacy_by_default",
        statement: "Privacy by Default. Not by Request.",
        class: "marketing_only",
        category: "positioning",
        appliesTo: ["both"],
    },
    {
        id: "drop_max_file_size",
        statement: "Up to 250GB file transfers",
        shortLabel: "Up to 250GB Files",
        class: "verified_in_repo",
        category: "infrastructure",
        verificationPath: "config/plans.ts",
        lastVerified: "2026-04-16",
        caveats: [
            "250GB is the Pro tier limit; free tier is 5GB",
        ],
        appliesTo: ["drop"],
    },
]

// ─── Helpers ────────────────────────────────────────────────────────────────

export function getClaimsByProduct(product: "alias" | "drop" | "both"): Claim[] {
    return CLAIMS.filter((c) => c.appliesTo.includes(product) || c.appliesTo.includes("both"))
}

export function getClaimsByClass(cls: ClaimClass): Claim[] {
    return CLAIMS.filter((c) => c.class === cls)
}

export function getClaimsByCategory(category: ClaimCategory): Claim[] {
    return CLAIMS.filter((c) => c.category === category)
}

export function getClaimById(id: string): Claim | undefined {
    return CLAIMS.find((c) => c.id === id)
}

export function getClaimsByIds(ids: readonly string[]): Claim[] {
    return ids
        .map((id) => getClaimById(id))
        .filter((claim): claim is Claim => Boolean(claim))
}

export function getVerificationSummary() {
    const verified = CLAIMS.filter((c) => c.class === "verified_in_repo").length
    const external = CLAIMS.filter((c) => c.class === "depends_on_external_infra").length
    const marketing = CLAIMS.filter((c) => c.class === "marketing_only").length
    return { verified, external, marketing, total: CLAIMS.length }
}

/**
 * Trust indicators for product pages.
 * Returns claims with shortLabels for the given product.
 */
export function getTrustIndicators(product: "alias" | "drop"): { label: string; claimId: string }[] {
    const productClaims = getClaimsByProduct(product)
    return productClaims
        .filter((c) => c.shortLabel)
        .map((c) => ({ label: c.shortLabel!, claimId: c.id }))
}

/**
 * Trust indicators for the homepage hero section.
 * Only includes claims that can be stated without qualification.
 */
export const HERO_TRUST_INDICATORS = [
    { label: "Open Source", claimId: "open_source" },
    { label: "Zero-Knowledge Drop", claimId: "drop_zero_knowledge" },
    { label: "Encrypted", claimId: "drop_e2e_encryption" },
] as const
