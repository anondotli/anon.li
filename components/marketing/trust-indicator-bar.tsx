import { getTrustIndicators } from "@/config/claims"
import { HeroTrustBar } from "./hero-trust-bar"

interface TrustIndicatorBarProps {
    product: "alias" | "drop"
    className?: string
}

export function TrustIndicatorBar({ product, className }: TrustIndicatorBarProps) {
    const indicators = getTrustIndicators(product)

    return (
        <HeroTrustBar
            items={indicators.map((item) => ({ label: item.label, href: "/security" }))}
            className={className}
        />
    )
}
