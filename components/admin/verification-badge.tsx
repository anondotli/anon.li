import { cn } from "@/lib/utils"
import { CheckCircle2, XCircle, AlertCircle } from "lucide-react"

interface VerificationBadgeProps {
    verified: boolean
    label?: string
    showIcon?: boolean
    size?: "sm" | "md"
}

export function VerificationBadge({
    verified,
    label,
    showIcon = true,
    size = "md"
}: VerificationBadgeProps) {
    const sizeClasses = size === "sm" ? "text-xs px-1.5 py-0.5" : "text-sm px-2 py-1"
    const iconSize = size === "sm" ? "h-3 w-3" : "h-4 w-4"

    return (
        <span
            className={cn(
                "inline-flex items-center gap-1 rounded-full font-medium",
                sizeClasses,
                verified
                    ? "bg-green-500/10 text-green-600 dark:text-green-400"
                    : "bg-yellow-500/10 text-yellow-600 dark:text-yellow-400"
            )}
        >
            {showIcon && (
                verified ? (
                    <CheckCircle2 className={iconSize} />
                ) : (
                    <AlertCircle className={iconSize} />
                )
            )}
            {label || (verified ? "Verified" : "Unverified")}
        </span>
    )
}

interface DomainVerificationStatusProps {
    domain: {
        verified: boolean
        ownershipVerified: boolean
        mxVerified: boolean
        spfVerified: boolean
        dkimVerified: boolean
    }
    compact?: boolean
}

export function DomainVerificationStatus({ domain, compact = false }: DomainVerificationStatusProps) {
    const checks = [
        { key: "ownership", label: "Ownership", verified: domain.ownershipVerified },
        { key: "mx", label: "MX", verified: domain.mxVerified },
        { key: "spf", label: "SPF", verified: domain.spfVerified },
        { key: "dkim", label: "DKIM", verified: domain.dkimVerified },
    ]

    const passedCount = checks.filter(c => c.verified).length

    if (compact) {
        return (
            <span className={cn(
                "text-sm font-medium",
                passedCount === 4 ? "text-green-600 dark:text-green-400" :
                passedCount > 0 ? "text-yellow-600 dark:text-yellow-400" :
                "text-muted-foreground"
            )}>
                {passedCount}/4
            </span>
        )
    }

    return (
        <div className="flex flex-wrap gap-2">
            {checks.map((check) => (
                <span
                    key={check.key}
                    className={cn(
                        "inline-flex items-center gap-1 text-xs px-2 py-1 rounded",
                        check.verified
                            ? "bg-green-500/10 text-green-600 dark:text-green-400"
                            : "bg-muted text-muted-foreground"
                    )}
                >
                    {check.verified ? (
                        <CheckCircle2 className="h-3 w-3" />
                    ) : (
                        <XCircle className="h-3 w-3" />
                    )}
                    {check.label}
                </span>
            ))}
        </div>
    )
}
