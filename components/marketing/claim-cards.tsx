import { CheckCircle2, ExternalLink, Info, Megaphone } from "lucide-react"

import { Badge } from "@/components/ui/badge"
import { VERIFICATION_CLASS_META, type Claim } from "@/config/claims"
import { cn } from "@/lib/utils"

interface ClaimCardsProps {
    claims: Claim[]
    className?: string
}

const toneMap = {
    verified_in_repo: {
        icon: CheckCircle2,
        badgeClass: "border-green-500/20 bg-green-500/10 text-green-700 dark:text-green-300",
        iconClass: "text-green-600 dark:text-green-400",
        cardClass: "border-green-500/15 bg-green-500/5",
    },
    depends_on_external_infra: {
        icon: Info,
        badgeClass: "border-blue-500/20 bg-blue-500/10 text-blue-700 dark:text-blue-300",
        iconClass: "text-blue-600 dark:text-blue-400",
        cardClass: "border-blue-500/15 bg-blue-500/5",
    },
    marketing_only: {
        icon: Megaphone,
        badgeClass: "border-amber-500/20 bg-amber-500/10 text-amber-700 dark:text-amber-300",
        iconClass: "text-amber-600 dark:text-amber-400",
        cardClass: "border-amber-500/15 bg-amber-500/5",
    },
} as const

export function ClaimCards({ claims, className }: ClaimCardsProps) {
    return (
        <div className={cn("grid gap-4 md:grid-cols-2", className)}>
            {claims.map((claim) => {
                const tone = toneMap[claim.class]
                const Icon = tone.icon

                return (
                    <article
                        key={claim.id}
                        className={cn("rounded-3xl border p-5 shadow-sm", tone.cardClass)}
                    >
                        <div className="mb-4 flex flex-wrap items-center gap-2">
                            <Badge variant="outline" className={cn("rounded-full px-3 py-1 text-[11px] font-medium", tone.badgeClass)}>
                                <Icon className={cn("mr-1.5 h-3.5 w-3.5", tone.iconClass)} />
                                {VERIFICATION_CLASS_META[claim.class].label}
                            </Badge>
                            {claim.category && (
                                <Badge variant="outline" className="rounded-full px-3 py-1 text-[11px] font-medium text-muted-foreground">
                                    {claim.category.replace(/_/g, " ")}
                                </Badge>
                            )}
                        </div>

                        <p className="text-base font-medium leading-relaxed">{claim.statement}</p>
                        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                            {VERIFICATION_CLASS_META[claim.class].description}
                        </p>

                        <div className="mt-4 space-y-2 text-sm text-muted-foreground">
                            {claim.lastVerified && (
                                <p>
                                    Last verified: <span className="text-foreground">{formatDate(claim.lastVerified)}</span>
                                </p>
                            )}

                            {claim.verificationPath && (
                                <p>
                                    Source reference: <span className="font-mono text-xs text-foreground">{claim.verificationPath}</span>
                                </p>
                            )}

                            {claim.sourceUrl && (
                                <a
                                    href={claim.sourceUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="inline-flex items-center gap-1.5 text-primary hover:underline"
                                >
                                    Source
                                    <ExternalLink className="h-3.5 w-3.5" />
                                </a>
                            )}
                        </div>

                        {claim.caveats && claim.caveats.length > 0 && (
                            <div className="mt-4 rounded-2xl border border-border/50 bg-background/70 p-4">
                                <p className="mb-2 text-xs font-medium uppercase tracking-[0.18em] text-muted-foreground">
                                    Caveats
                                </p>
                                <ul className="space-y-2 text-sm text-muted-foreground">
                                    {claim.caveats.map((caveat) => (
                                        <li key={caveat} className="flex items-start gap-2">
                                            <span className="mt-1 h-1.5 w-1.5 rounded-full bg-muted-foreground/60" />
                                            <span>{caveat}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}
                    </article>
                )
            })}
        </div>
    )
}

function formatDate(value: string) {
    return new Intl.DateTimeFormat("en-US", {
        month: "long",
        day: "numeric",
        year: "numeric",
    }).format(new Date(`${value}T00:00:00Z`))
}
