import { PageHero } from "./page-hero"
import { MarketingBadge } from "./marketing-badge"
import { HeroAuthCta } from "./auth-aware-cta"
import { HeroTrustBar } from "./hero-trust-bar"
import { HERO_TRUST_INDICATORS } from "@/config/claims"

export function HeroSection() {
    return (
        <PageHero
            badge={<MarketingBadge href="/blog/introduction">Introducing anon.li</MarketingBadge>}
            title={
                <>
                    Privacy by Default.<br className="hidden md:block" />
                    <span className="italic text-muted-foreground">Not by Request.</span>
                </>
            }
            subtitle="Anonymous email aliases, end-to-end encrypted file sharing, and confidential forms. We can't read any of it - by design, not by policy."
            actions={<HeroAuthCta />}
        >
            <HeroTrustBar
                items={HERO_TRUST_INDICATORS.map((item) => ({ label: item.label, href: "/security" }))}
            />
        </PageHero>
    )
}
