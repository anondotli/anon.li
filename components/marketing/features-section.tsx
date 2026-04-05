import { Shield, Sparkles, Lock, Globe, Key, Flame } from "lucide-react"
import { FeatureCard } from "@/components/marketing/feature-card"
import { getClaimById } from "@/config/claims"

/**
 * Feature cards on the homepage. Each card references one or more claim IDs
 * from config/claims.ts so marketing copy stays tied to verifiable statements.
 */
const FEATURE_CARDS = [
    {
        icon: Shield,
        title: "Zero-Knowledge Drop",
        description: "Drop files are encrypted in your browser before upload. Alias forwards mail to your real inbox instead of operating a hosted mailbox.",
        claimIds: ["drop_zero_knowledge", "drop_client_side_encryption", "alias_no_email_storage"],
    },
    {
        icon: Sparkles,
        title: "Open Source",
        description: "Our platform code is open source. Audit our code and verify our security claims yourself.",
        claimIds: ["open_source"],
    },
    {
        icon: Lock,
        title: "No Registration Required",
        description: "Share files instantly without creating an account. Full privacy even for one-time use.",
        claimIds: ["no_registration_drop"],
    },
    {
        icon: Globe,
        title: "Custom Domains",
        description: "Use your own domain for professional aliases with custom DNS and DKIM support.",
        claimIds: ["alias_dkim_spf_dmarc"],
    },
    {
        icon: Key,
        title: "End-to-End Encryption",
        description: "AES-256-GCM for Drop files, plus optional PGP for forwarded Alias copies. Industry-standard cryptography without custom primitives.",
        claimIds: ["drop_aes256gcm", "alias_pgp"],
    },
    {
        icon: Flame,
        title: "Self-Destructing Data",
        description: "Set expiry dates and download limits so shared files disappear on your schedule.",
        claimIds: ["download_limit_enforcement"],
    },
] as const

// Validate that all referenced claim IDs exist at module load time
if (process.env.NODE_ENV === "development") {
    for (const card of FEATURE_CARDS) {
        for (const id of card.claimIds) {
            if (!getClaimById(id)) {
                console.warn(`[features-section] Unknown claim ID: ${id}`)
            }
        }
    }
}

export function FeaturesSection() {
    return (
        <section id="features" className="w-full py-12 md:py-20 bg-background">
            <div className="container mx-auto px-6">
                <div className="mb-8 md:mb-14 space-y-4 max-w-2xl">
                    <h2 className="text-3xl md:text-4xl font-serif font-medium tracking-tight">Why Choose anon.li?</h2>
                    <p className="text-base md:text-lg text-muted-foreground font-light">
                        Privacy isn&apos;t just a feature. It&apos;s our foundation.
                    </p>
                </div>

                <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
                    {FEATURE_CARDS.map((card) => (
                        <FeatureCard
                            key={card.title}
                            icon={<card.icon className="h-6 w-6" />}
                            title={card.title}
                            description={card.description}
                        />
                    ))}
                </div>
            </div>
        </section>
    )
}
