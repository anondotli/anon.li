"use client"

import { ShieldCheck, Copy } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"

interface DomainOwnershipStepProps {
    verified: boolean
    verificationToken: string
}

export function DomainOwnershipStep({ verified, verificationToken }: DomainOwnershipStepProps) {
    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text)
        toast.success(`Copied ${label} to clipboard`)
    }

    return (
        <div className={cn("rounded-xl border p-4 transition-all",
            verified ? "bg-card/50 border-border/50 opacity-60 hover:opacity-100" : "bg-card border-amber-500/20 shadow-sm ring-1 ring-amber-500/10"
        )}>
            <div className="flex items-start gap-4">
                <div className={cn("mt-1 p-2 rounded-lg", verified ? "bg-green-500/10 text-green-600" : "bg-amber-500/10 text-amber-600")}>
                    <ShieldCheck className="h-5 w-5" />
                </div>
                <div className="flex-1 space-y-3 min-w-0">
                    <div className="flex items-center justify-between gap-4">
                        <div>
                            <span className="font-medium block">1. Ownership Verification</span>
                            <p className="text-sm text-muted-foreground">Add this TXT record to your DNS configuration to prove you own the domain.</p>
                        </div>
                        {verified ? (
                            <Badge variant="outline" className="bg-green-500/5 text-green-600 border-green-500/20 shrink-0">Verified</Badge>
                        ) : (
                            <Badge variant="outline" className="bg-amber-500/5 text-amber-600 border-amber-500/20 shrink-0">Required</Badge>
                        )}
                    </div>

                    {!verified && (
                        <div className="grid sm:grid-cols-3 gap-2 text-sm bg-muted/50 rounded-lg p-3 border border-border/50">
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Type</span>
                                <div className="font-mono text-foreground font-medium">TXT</div>
                            </div>
                            <div className="space-y-1">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Name / Host</span>
                                <div className="font-mono text-foreground font-medium">@</div>
                            </div>
                            <div className="space-y-1 min-w-0">
                                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Value</span>
                                <div className="flex items-center gap-2 group/value min-w-0">
                                    <code className="flex-1 bg-background px-2 py-1 rounded border border-border/50 font-mono text-xs truncate">
                                        anon.li={verificationToken}
                                    </code>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-6 w-6 shrink-0 opacity-0 group-hover/value:opacity-100 transition-opacity"
                                        onClick={() => copyToClipboard(`anon.li=${verificationToken}`, "Verification Token")}
                                    >
                                        <Copy className="h-3 w-3" />
                                    </Button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}
