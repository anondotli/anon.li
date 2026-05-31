import Link from "next/link"
import {
    Ban,
    Bird,
    BookOpenCheck,
    CheckSquare,
    ClipboardList,
    Code2,
    Download,
    EyeOff,
    FileKey,
    FileUp,
    Fingerprint,
    Frame,
    Globe,
    Key,
    KeyRound,
    Lock,
    Mail,
    MessageSquareReply,
    Paperclip,
    Puzzle,
    QrCode,
    Shield,
    ShieldCheck,
    Sliders,
    Terminal,
    Trash2,
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
 *
 * The hero grid is capped at the nine strongest features (three per core
 * product). Everything else is reachable through the grouped "Advanced
 * controls" lists and the "Automation & AI access" panel below.
 */
const HOME_PRIMARY_FEATURE_IDS = [
    "alias_private_aliases",
    "alias_reply_privately",
    "alias_tracker_removal",
    "drop_browser_encryption",
    "drop_zero_knowledge_links",
    "drop_no_account_download",
    "form_e2e_encrypted",
    "form_confidential_intake",
    "form_block_builder",
] as const

const HOME_ADVANCED_GROUPS = [
    {
        label: "Alias",
        ids: [
            "alias_custom_domains",
            "alias_recipients",
            "alias_pgp_forwarding",
            "alias_encrypted_metadata",
        ],
    },
    {
        label: "Drop",
        ids: [
            "drop_password_protection",
            "drop_expiry_download_limits",
            "drop_link_controls",
            "drop_qr_sharing",
        ],
    },
    {
        label: "Form",
        ids: [
            "form_password_protection",
            "form_attachments",
            "form_submission_caps",
            "form_iframe_embed",
        ],
    },
    {
        label: "Trust & safety",
        ids: [
            "trust_open_source",
            "trust_no_logs",
            "trust_two_factor",
            "trust_warrant_canary",
        ],
    },
] as const

const HOME_TOOL_FEATURE_IDS = [
    "developer_mcp",
    "developer_rest_api",
    "developer_cli",
    "developer_extension",
] as const

const FEATURE_ICONS: Record<string, LucideIcon> = {
    alias_private_aliases: Mail,
    alias_reply_privately: MessageSquareReply,
    alias_pause_block: Ban,
    alias_custom_domains: Globe,
    alias_recipients: Users,
    alias_pgp_forwarding: Key,
    alias_encrypted_metadata: Fingerprint,
    alias_tracker_removal: EyeOff,
    alias_usage_stats: BookOpenCheck,
    drop_browser_encryption: Lock,
    drop_zero_knowledge_links: Shield,
    drop_no_account_download: Download,
    drop_large_uploads: FileUp,
    drop_password_protection: KeyRound,
    drop_expiry_download_limits: FileKey,
    drop_link_controls: ShieldCheck,
    drop_qr_sharing: QrCode,
    form_e2e_encrypted: Lock,
    form_block_builder: Sliders,
    form_confidential_intake: ClipboardList,
    form_password_protection: KeyRound,
    form_attachments: Paperclip,
    form_submission_caps: CheckSquare,
    form_iframe_embed: Frame,
    trust_open_source: Code2,
    trust_claim_transparency: BookOpenCheck,
    trust_no_logs: Trash2,
    trust_warrant_canary: Bird,
    trust_two_factor: ShieldCheck,
    trust_data_control: Fingerprint,
    developer_rest_api: Code2,
    developer_cli: Terminal,
    developer_extension: Puzzle,
    developer_mcp: Shield,
}

const PRIMARY_FEATURES = getFeaturesByIds(HOME_PRIMARY_FEATURE_IDS)
const ADVANCED_GROUPS = HOME_ADVANCED_GROUPS.map((group) => ({
    label: group.label,
    features: getFeaturesByIds(group.ids),
}))
const TOOL_FEATURES = getFeaturesByIds(HOME_TOOL_FEATURE_IDS)

// Validate that all referenced claim IDs exist at module load time
if (process.env.NODE_ENV === "development") {
    const advancedFeatures = ADVANCED_GROUPS.flatMap((group) => group.features)
    for (const feature of [...PRIMARY_FEATURES, ...advancedFeatures, ...TOOL_FEATURES]) {
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
                        <FeatureLinkCard key={feature.id} feature={feature} />
                    ))}
                </div>

                <div className="mt-12 grid gap-6 lg:grid-cols-[1.6fr_1fr] lg:items-stretch">
                    <div className="rounded-2xl border border-border/40 bg-secondary/20 p-6 md:p-8">
                        <div className="max-w-md">
                            <h3 className="font-serif text-xl font-medium">Advanced controls</h3>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                Powerful but contextual options, grouped by product so they surface where they help.
                            </p>
                        </div>
                        <div className="mt-6 grid gap-x-8 gap-y-6 sm:grid-cols-2">
                            {ADVANCED_GROUPS.map((group) => (
                                <AdvancedGroup key={group.label} label={group.label} features={group.features} />
                            ))}
                        </div>
                    </div>

                    <div className="rounded-2xl border border-primary/15 bg-gradient-to-b from-primary/[0.06] to-transparent p-6 md:p-8">
                        <div>
                            <h3 className="font-serif text-xl font-medium">Automation &amp; AI access</h3>
                            <p className="mt-1.5 text-sm text-muted-foreground">
                                Drive anon.li from AI agents over MCP, the REST API, the CLI, or the browser extension.
                            </p>
                        </div>
                        <div className="mt-6 space-y-3">
                            {TOOL_FEATURES.map((feature) => (
                                <ToolCard key={feature.id} feature={feature} />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </section>
    )
}

function FeatureLinkCard({ feature }: { feature: FeaturePresentation }) {
    const Icon = FEATURE_ICONS[feature.id] ?? Shield

    return (
        <Link href={feature.href} className="block h-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 rounded-xl">
            <FeatureCard
                icon={<Icon className="h-6 w-6" />}
                title={feature.title}
                description={feature.description}
            />
        </Link>
    )
}

function AdvancedGroup({ label, features }: { label: string; features: FeaturePresentation[] }) {
    return (
        <div>
            <h4 className="text-xs font-medium uppercase tracking-wider text-muted-foreground/70">{label}</h4>
            <ul className="mt-3 space-y-1">
                {features.map((feature) => {
                    const Icon = FEATURE_ICONS[feature.id] ?? Shield
                    return (
                        <li key={feature.id}>
                            <Link
                                href={feature.href}
                                title={feature.description}
                                className="group -mx-2 flex items-center gap-2.5 rounded-md px-2 py-1.5 transition-colors hover:bg-primary/5"
                            >
                                <Icon className="h-4 w-4 shrink-0 text-primary/70 transition-colors group-hover:text-primary" />
                                <span className="truncate text-sm text-foreground/80 transition-colors group-hover:text-primary">
                                    {feature.shortTitle}
                                </span>
                            </Link>
                        </li>
                    )
                })}
            </ul>
        </div>
    )
}

function ToolCard({ feature }: { feature: FeaturePresentation }) {
    const Icon = FEATURE_ICONS[feature.id] ?? Shield

    return (
        <Link
            href={feature.href}
            className={cn(
                "group flex items-start gap-3 rounded-xl border border-border/40 bg-background/60 p-3.5",
                "transition-colors hover:border-primary/30 hover:bg-background"
            )}
        >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
                <Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
                <span className="block text-sm font-medium group-hover:text-primary">{feature.shortTitle}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">{feature.description}</span>
            </span>
        </Link>
    )
}
