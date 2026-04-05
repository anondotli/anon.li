import Link from "next/link"
import { CheckCircle2 } from "lucide-react"
import { getTrustIndicators } from "@/config/claims"

interface TrustIndicatorBarProps {
    product: "alias" | "drop"
    className?: string
}

export function TrustIndicatorBar({ product, className = "" }: TrustIndicatorBarProps) {
    const indicators = getTrustIndicators(product)

    return (
        <div className={`flex flex-wrap justify-center gap-x-12 gap-y-6 font-medium text-muted-foreground/80 uppercase tracking-widest text-xs ${className}`}>
            {indicators.map((item) => (
                <Link
                    key={item.claimId}
                    href="/security"
                    className="flex items-center gap-3 hover:text-foreground/70 transition-colors"
                >
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    <span>{item.label}</span>
                </Link>
            ))}
        </div>
    )
}
