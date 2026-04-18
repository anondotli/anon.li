import Link from "next/link"
import {
    Ban,
    BookOpenCheck,
    Code2,
    Download,
    FileKey,
    FileUp,
    Fingerprint,
    Globe,
    Key,
    KeyRound,
    Lock,
    Mail,
    MessageSquareReply,
    Puzzle,
    QrCode,
    Shield,
    ShieldCheck,
    Terminal,
    Users,
} from "lucide-react"
import type { LucideIcon } from "lucide-react"
import { FeatureCard } from "@/components/marketing/feature-card"
import { getClaimById } from "@/config/claims"
import { getFeaturesByIds, type FeaturePresentation } from "@/config/features"
import { cn } from "@/lib/utils"

/**
 * Feature cards on the homepage. IDs come from config/features.ts and
 * claim-backed entries still validate against config/claims.ts.
 */
const HOME_PRIMARY_FEATURE_IDS = [
    "alias_private_aliases",
    "alias_reply_privately",
    "drop_browser_encryption",
    "drop_zero_knowledge_links",
    "drop_no_account_download",
    "trust_open_source",
] as const

const HOME_ADVANCED_FEATURE_IDS = [
    "alias_custom_domains",
    "alias_recipients",
    "alias_pgp_forwarding",
    "alias_encrypted_metadata",
    "drop_password_protection",
    "drop_expiry_download_limits",
    "drop_link_controls",
    "drop_qr_sharing",
    "trust_two_factor",
    "trust_data_control",
] as const

const HOME_TOOL_FEATURE_IDS = [
    "developer_rest_api",
    "developer_cli",
    "developer_extension",
    "developer_mcp",
] as const

const FEATURE_ICONS: Record<string, LucideIcon> = {
    alias_private_aliases: Mail,
    alias_reply_privately: MessageSquareReply,
    alias_pause_block: Ban,
    alias_custom_domains: Globe,
    alias_recipients: Users,
    alias_pgp_forwarding: Key,
    alias_encrypted_metadata: Fingerprint,
    alias_usage_stats: BookOpenCheck,
    drop_browser_encryption: Lock,
    drop_zero_knowledge_links: Shield,
    drop_no_account_download: Download,
    drop_large_uploads: FileUp,
    drop_password_protection: KeyRound,
    drop_expiry_download_limits: FileKey,
    drop_link_controls: ShieldCheck,
    drop_qr_sharing: QrCode,
    trust_open_source: Code2,
    trust_claim_transparency: BookOpenCheck,
    trust_two_factor: ShieldCheck,
    trust_data_control: Fingerprint,
    developer_rest_api: Code2,
    developer_cli: Terminal,
    developer_extension: Puzzle,
    developer_mcp: Shield,
}

const PRIMARY_FEATURES = getFeaturesByIds(HOME_PRIMARY_FEATURE_IDS)
const ADVANCED_FEATURES = getFeaturesByIds(HOME_ADVANCED_FEATURE_IDS)
const TOOL_FEATURES = getFeaturesByIds(HOME_TOOL_FEATURE_IDS)

// Validate that all referenced claim IDs exist at module load time
if (process.env.NODE_ENV === "development") {
    for (const feature of [...PRIMARY_FEATURES, ...ADVANCED_FEATURES, ...TOOL_FEATURES]) {
        for (const id of feature.claimIds ?? []) {
            if (!getClaimById(id)) {
                throw new Error(`[features-section] Unknown claim ID: ${id}`)
            }
        }
    }
}

export function FeaturesSection() {
    return (
        <section id="features" className="w-full py-12 md:py-20 bg-background">
            <div className="container mx-auto px-6">
                <div className="mb-8 md:mb-14 space-y-4 max-w-2xl">
                    <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">What anon.li protects</h2>
                    <p className="text-base md:text-lg text-muted-foreground font-light">
                        The main flows stay simple, while deeper privacy, security, and automation controls are ready when you need them.
                    </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {PRIMARY_FEATURES.map((feature) => (
                        <FeatureLinkCard key={feature.id} feature={feature} size="large" />
                    ))}
                </div>

                <div className="mt-12 grid gap-8 lg:grid-cols-[1.5fr_1fr]">
                    <div className="rounded-xl border border-border/40 bg-secondary/20 p-5 md:p-6">
                        <div className="mb-5">
                            <h3 className="font-serif text-xl font-medium">Advanced controls</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                These are powerful but contextual, so they appear where they help instead of competing with the first-use flow.
                            </p>
                        </div>
                        <div className="grid gap-3 sm:grid-cols-2">
                            {ADVANCED_FEATURES.map((feature) => (
                                <CompactFeatureLink key={feature.id} feature={feature} />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-xl border border-border/40 bg-background p-5 md:p-6">
                        <div className="mb-5">
                            <h3 className="font-serif text-xl font-medium">Power tools</h3>
                            <p className="mt-1 text-sm text-muted-foreground">
                                Automation and browser workflows stay discoverable without overshadowing Alias and Drop.
                            </p>
                        </div>
                        <div className="grid gap-3">
                            {TOOL_FEATURES.map((feature) => (
                                <CompactFeatureLink key={feature.id} feature={feature} subtle />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

function FeatureLinkCard({
    feature,
    size,
}: {
    feature: FeaturePresentation
    size?: "large"
}) {
    const Icon = FEATURE_ICONS[feature.id] ?? Shield

    return (
        <Link href={feature.href} className={cn("block h-full", size === "large" && "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2")}>
            <FeatureCard
                icon={<Icon className="h-6 w-6" />}
                title={feature.title}
                description={feature.description}
            />
        </Link>
    )
}

function CompactFeatureLink({
    feature,
    subtle = false,
}: {
    feature: FeaturePresentation
    subtle?: boolean
}) {
    const Icon = FEATURE_ICONS[feature.id] ?? Shield

    return (
        <Link
            href={feature.href}
            className={cn(
                "group flex items-start gap-3 rounded-lg border border-border/40 bg-background p-3 transition-colors hover:border-primary/20 hover:bg-primary/5",
                subtle && "bg-secondary/20"
            )}
        >
            <Icon className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
            <span className="min-w-0">
                <span className="block text-sm font-medium group-hover:text-primary">{feature.shortTitle}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{feature.description}</span>
            </span>
        </Link>
    )
}
