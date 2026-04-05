import { Metadata } from "next"
import Link from "next/link"
import { Shield, Calendar, FileCheck, AlertTriangle, ShieldAlert } from "lucide-react"
import { Button } from "@/components/ui/button"
import { loadCanaryData } from "@/lib/canary"

export const metadata: Metadata = {
    title: "Warrant Canary",
    description: "anon.li's warrant canary - transparency about government requests and legal orders.",
}

export default function WarrantCanaryPage() {
    const canary = loadCanaryData()

    // Fallback if canary.json doesn't exist yet
    const lastUpdated = canary?.lastUpdated
        ? new Date(canary.lastUpdated).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "Not available"
    const nextUpdate = canary?.nextUpdate
        ? new Date(canary.nextUpdate).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })
        : "Not available"

    const allClear = canary?.statements.every((s) => s.status === "clear") ?? false
    const isStale = canary?.isStale ?? true

    return (
        <>
            <section className="py-24 md:py-32">
                <div className="container mx-auto px-6 max-w-4xl">
                    <div className="text-center mb-16">
                        {allClear && !isStale ? (
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-green-500/10 text-green-600 dark:text-green-400 text-sm font-medium mb-6">
                                <Shield className="h-4 w-4" />
                                <span>All Clear</span>
                            </div>
                        ) : isStale ? (
                            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-amber-500/10 text-amber-600 dark:text-amber-400 text-sm font-medium mb-6">
                                <ShieldAlert className="h-4 w-4" />
                                <span>Update Overdue</span>
                            </div>
                        ) : null}
                        <h1 className="text-4xl md:text-5xl font-serif font-medium tracking-tight text-primary mb-6">
                            Warrant Canary
                        </h1>
                        <p className="text-lg text-muted-foreground max-w-2xl mx-auto font-light leading-relaxed">
                            This page serves as our transparency commitment. As of the date below,
                            anon.li has not received any legal demands that we are prohibited from disclosing.
                        </p>
                    </div>

                    {isStale && (
                        <div className="bg-amber-500/10 rounded-[2rem] p-8 md:p-12 mb-8">
                            <div className="flex items-start gap-4">
                                <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 mt-1 shrink-0" />
                                <div>
                                    <h3 className="text-lg font-medium mb-2">This canary is overdue for an update</h3>
                                    <p className="text-muted-foreground leading-relaxed">
                                        The next update was expected by {nextUpdate}. An overdue canary may indicate
                                        operational delay or may indicate that the statements below can no longer
                                        be truthfully made. Please consider your threat model accordingly.
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Canary Statement */}
                    <div className="bg-card rounded-[2rem] border border-border/50 p-8 md:p-12 mb-12">
                        <div className="flex items-center gap-3 mb-6">
                            <FileCheck className="h-6 w-6 text-green-600 dark:text-green-400" />
                            <h2 className="text-2xl font-serif font-medium">Current Status</h2>
                        </div>

                        <div className="space-y-6 text-muted-foreground leading-relaxed">
                            <p>
                                As of <strong className="text-foreground">{lastUpdated}</strong>, anon.li makes the following statements:
                            </p>

                            <ul className="space-y-4">
                                {canary?.statements.map((statement, i) => (
                                    <li key={i} className="flex items-start gap-3">
                                        {statement.status === "clear" ? (
                                            <span className="text-green-600 dark:text-green-400 mt-1">✓</span>
                                        ) : (
                                            <span className="text-red-600 dark:text-red-400 mt-1">✗</span>
                                        )}
                                        <span>{statement.text}</span>
                                    </li>
                                )) ?? (
                                    <li className="text-muted-foreground">Canary data not available.</li>
                                )}
                            </ul>
                        </div>

                        <div className="mt-8 pt-8 border-t border-border/50 flex flex-wrap gap-6">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                <span>Last updated: <strong className="text-foreground">{lastUpdated}</strong></span>
                            </div>
                            <div className="flex items-center gap-2 text-sm text-muted-foreground">
                                <Calendar className="h-4 w-4" />
                                <span>Next update: <strong className="text-foreground">{nextUpdate}</strong></span>
                            </div>
                            {canary?.signatureVerified && (
                                <div className="flex items-center gap-2 text-sm text-green-600 dark:text-green-400">
                                    <Shield className="h-4 w-4" />
                                    <span>Signature file present</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* What is a Warrant Canary */}
                    <div className="bg-secondary/30 rounded-[2rem] p-8 md:p-12 mb-12">
                        <h2 className="text-2xl font-serif font-medium mb-6">What is a Warrant Canary?</h2>
                        <div className="space-y-4 text-muted-foreground leading-relaxed">
                            <p>
                                A warrant canary is a method by which a service provider can inform users about
                                government subpoenas or warrants, even when legally prohibited from directly
                                disclosing them.
                            </p>
                            <p>
                                The concept is simple: we regularly publish a statement confirming we have not
                                received any secret legal demands. If this statement ever disappears or stops
                                being updated, it may indicate that we can no longer truthfully make these claims.
                            </p>
                            <p>
                                The name comes from the canaries that coal miners used to detect dangerous gases -
                                if the canary stopped singing, miners knew something was wrong.
                            </p>
                        </div>
                    </div>

                    {/* Important Notice */}
                    <div className="bg-amber-500/10 rounded-[2rem] p-8 md:p-12 mb-12">
                        <div className="flex items-start gap-4">
                            <AlertTriangle className="h-6 w-6 text-amber-600 dark:text-amber-400 mt-1 shrink-0" />
                            <div>
                                <h3 className="text-lg font-medium mb-3">Important Notice</h3>
                                <p className="text-muted-foreground leading-relaxed">
                                    If this page is not updated by the scheduled date, or if any of the above
                                    statements are removed, users should assume that we may have received a
                                    legal demand that we cannot disclose. In such a case, we recommend users
                                    consider their threat model and take appropriate precautions.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Our Commitment */}
                    <div className="text-center">
                        <h2 className="text-2xl font-serif font-medium mb-4">Our Commitment to Privacy</h2>
                        <p className="text-muted-foreground max-w-2xl mx-auto mb-8 leading-relaxed">
                            anon.li is built with privacy-first architecture. Our end-to-end encryption means
                            we cannot access your file contents even if compelled. We collect minimal metadata
                            and are transparent about our practices.
                        </p>
                        <div className="flex flex-wrap justify-center gap-4">
                            <Button asChild variant="outline" className="rounded-full">
                                <Link href="/security">
                                    Security Architecture
                                </Link>
                            </Button>
                            <Button asChild variant="outline" className="rounded-full">
                                <Link href="/privacy">
                                    Privacy Policy
                                </Link>
                            </Button>
                        </div>
                    </div>
                </div>
            </section>
        </>
    )
}
