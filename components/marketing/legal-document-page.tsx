import { ArrowUpRight, FileText } from "lucide-react"

import { ClaimCards } from "@/components/marketing/claim-cards"
import { Badge } from "@/components/ui/badge"
import { type Claim } from "@/config/claims"
import { MDXContent } from "@/components/shared/mdx-content"

interface LegalDocumentPageProps {
    title: string
    summary?: string
    lastUpdated?: string
    source: string
    sourceLabel: string
    sourceHref: string
    claims?: Claim[]
}

export function LegalDocumentPage({
    title,
    summary,
    lastUpdated,
    source,
    sourceLabel,
    sourceHref,
    claims = [],
}: LegalDocumentPageProps) {
    return (
        <div className="container max-w-5xl py-16 md:py-24 space-y-12">
            <section className="space-y-6 text-center">
                <div className="inline-flex items-center rounded-full border border-primary/10 bg-primary/5 px-4 py-1.5 text-sm">
                    <FileText className="mr-2 h-4 w-4 text-primary" />
                    <span className="text-primary/80">Synced Legal Source</span>
                </div>
                <div className="space-y-4">
                    <h1 className="text-4xl md:text-5xl lg:text-6xl font-serif font-medium tracking-tight">
                        {title}
                    </h1>
                    {summary && (
                        <p className="mx-auto max-w-3xl text-lg leading-relaxed text-muted-foreground">
                            {summary}
                        </p>
                    )}
                </div>
                <div className="flex flex-wrap items-center justify-center gap-3 text-sm text-muted-foreground">
                    {lastUpdated && (
                        <Badge variant="outline" className="rounded-full px-4 py-1.5">
                            Last updated {formatDate(lastUpdated)}
                        </Badge>
                    )}
                    <a
                        href={sourceHref}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1.5 rounded-full border border-border/60 px-4 py-1.5 hover:bg-secondary/40 transition-colors"
                    >
                        {sourceLabel}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                    </a>
                </div>
            </section>

            {claims.length > 0 && (
                <section className="space-y-5">
                    <div className="space-y-2">
                        <h2 className="text-2xl font-serif font-medium">Implementation Notes</h2>
                        <p className="max-w-3xl text-sm leading-relaxed text-muted-foreground">
                            These operational claims are rendered from the shared trust registry so the public legal copy stays tied to the same verification trail used across the rest of the site.
                        </p>
                    </div>
                    <ClaimCards claims={claims} />
                </section>
            )}

            <section className="rounded-[2rem] border border-border/50 bg-card/70 p-6 md:p-10 shadow-sm">
                <div className="prose prose-lg dark:prose-invert prose-headings:font-serif prose-headings:font-medium prose-headings:scroll-mt-24 prose-p:font-light prose-p:leading-relaxed prose-a:text-primary prose-a:no-underline hover:prose-a:underline prose-code:before:content-none prose-code:after:content-none max-w-none">
                    <MDXContent source={source} />
                </div>
            </section>
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
