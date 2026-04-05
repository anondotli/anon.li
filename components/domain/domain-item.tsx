"use client"

import { useState } from "react"
import {
    CheckCircle2,
    AlertCircle,
    AlertTriangle,
    Trash2,
    RefreshCw,
    Loader2,
    ChevronDown,
    ChevronUp,
} from "lucide-react"
import Image from "next/image"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"
import { DomainOwnershipStep } from "@/components/domain/domain-ownership-step"
import { DomainDnsStep } from "@/components/domain/domain-dns-step"
import { verifyDomainAction, deleteDomainAction, regenerateDkimAction } from "@/actions/domain"

interface DomainItemProps {
    domain: {
        id: string
        domain: string
        verified: boolean
        ownershipVerified: boolean
        mxVerified: boolean
        spfVerified: boolean
        dnsVerified: boolean
        verificationToken: string
        dkimPublicKey: string | null
        dkimSelector: string | null
        dkimVerified: boolean
        scheduledForRemovalAt?: Date | null
    }
}

export function DomainItem({ domain }: DomainItemProps) {
    const [verifying, setVerifying] = useState(false)
    const [deleting, setDeleting] = useState(false)
    const [generatingDkim, setGeneratingDkim] = useState(false)
    const [isExpanded, setIsExpanded] = useState(!domain.verified)
    const [faviconError, setFaviconError] = useState(false)

    const handleVerify = async () => {
        setVerifying(true)
        try {
            const result = await verifyDomainAction(domain.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                if (result.data?.verified) {
                    toast.success("Domain verified successfully")
                } else if (result.data?.ownershipVerified) {
                    toast.success("Ownership verified! Please configure DNS records.")
                } else {
                    toast.error("Verification failed. Please check your DNS records.")
                }
            }
        } catch {
            toast.error("Something went wrong")
        } finally {
            setVerifying(false)
        }
    }

    const handleDelete = async () => {
        setDeleting(true)
        try {
            const result = await deleteDomainAction(domain.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Domain deleted")
            }
        } catch {
            toast.error("Something went wrong")
        } finally {
            setDeleting(false)
        }
    }

    const handleGenerateDkim = async () => {
        setGeneratingDkim(true)
        try {
            const result = await regenerateDkimAction(domain.id)
            if (result.error) {
                toast.error("Failed to generate DKIM keys")
            } else {
                toast.success("DKIM keys generated")
            }
        } catch {
            toast.error("Something went wrong")
        } finally {
            setGeneratingDkim(false)
        }
    }

    const statusColor = domain.verified
        ? "text-green-500 bg-green-500/10 border-green-500/20"
        : domain.ownershipVerified
            ? "text-blue-500 bg-blue-500/10 border-blue-500/20"
            : "text-amber-500 bg-amber-500/10 border-amber-500/20"

    const faviconUrl = `https://www.google.com/s2/favicons?sz=64&domain=${domain.domain}`

    return (
        <div className="group flex flex-col border rounded-xl bg-card overflow-hidden shadow-sm hover:shadow-md transition-all duration-300 animate-in fade-in slide-in-from-bottom-2">
            {/* Header */}
            <div className="p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-background to-secondary/5">
                <div className="flex items-center gap-4 min-w-0 w-full sm:w-auto">
                    <div className={cn("h-12 w-12 shrink-0 rounded-xl flex items-center justify-center transition-colors text-xl border shadow-sm overflow-hidden bg-secondary/50",
                        domain.verified ? "border-green-500/20 text-green-600" : "border-border text-foreground"
                    )}>
                        {!faviconError ? (
                            <Image
                                src={faviconUrl}
                                alt={domain.domain}
                                width={32}
                                height={32}
                                className="w-8 h-8 object-contain"
                                onError={() => setFaviconError(true)}
                                unoptimized
                            />
                        ) : (
                            <span>
                                {domain.domain.charAt(0).toUpperCase()}
                            </span>
                        )}
                    </div>
                    <div className="min-w-0 flex-1 sm:flex-initial">
                        <div className="flex items-center gap-3 flex-wrap">
                            <span className="font-semibold text-lg tracking-tight truncate">{domain.domain}</span>
                            <Badge variant="outline" className={cn("transition-colors shrink-0", statusColor)}>
                                {domain.verified ? (
                                    <><CheckCircle2 className="w-3 h-3 mr-1" /> Verified</>
                                ) : domain.ownershipVerified ? (
                                    <><CheckCircle2 className="w-3 h-3 mr-1" /> Owned</>
                                ) : (
                                    <><AlertCircle className="w-3 h-3 mr-1" /> Action Required</>
                                )}
                            </Badge>
                            {domain.scheduledForRemovalAt && (
                                <Badge variant="destructive" className="text-xs shrink-0">
                                    <AlertTriangle className="w-3 h-3 mr-1" />
                                    Removal scheduled
                                </Badge>
                            )}
                        </div>
                        <p className="text-sm text-muted-foreground mt-0.5 truncate">
                            {domain.verified
                                ? "All records configured correctly"
                                : domain.ownershipVerified
                                    ? "DNS records missing or incorrect"
                                    : "Domain ownership not yet verified"
                            }
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                    <div className="flex items-center gap-1 bg-secondary/50 p-1 rounded-lg border border-border/50">
                        {!domain.verified && (
                            <Button
                                variant="ghost"
                                size="sm"
                                onClick={handleVerify}
                                disabled={verifying}
                                className="h-8 text-xs font-medium hover:bg-background shadow-none"
                            >
                                {verifying ? <Loader2 className="h-3 w-3 animate-spin mr-2" /> : <RefreshCw className="h-3 w-3 mr-2" />}
                                Verify
                            </Button>
                        )}
                        <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="h-8 w-8 p-0"
                        >
                            {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                        </Button>
                    </div>

                    <AlertDialog>
                        <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-9 w-9 text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors" disabled={deleting}>
                                {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Delete Domain</AlertDialogTitle>
                                <AlertDialogDescription>
                                    Are you sure you want to delete <span className="font-medium text-foreground">{domain.domain}</span>?
                                    This will permanently remove the domain and all associated aliases.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleDelete} className="bg-destructive hover:bg-destructive/90">
                                    Delete Domain
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </div>

            {/* Expandable Content */}
            <div
                className={cn(
                    "grid transition-all duration-200 ease-in-out",
                    isExpanded ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
                )}
            >
                <div className="overflow-hidden">
                    <div className="border-t bg-muted/10 p-5 space-y-6">

                        {/* Step 1: Ownership */}
                        <DomainOwnershipStep
                            verified={domain.ownershipVerified}
                            verificationToken={domain.verificationToken}
                        />

                        {/* Step 2: DNS Records */}
                        <DomainDnsStep
                            domainId={domain.id}
                            dnsVerified={domain.dnsVerified}
                            mxVerified={domain.mxVerified}
                            spfVerified={domain.spfVerified}
                            dkimPublicKey={domain.dkimPublicKey}
                            dkimSelector={domain.dkimSelector}
                            dkimVerified={domain.dkimVerified}
                            onGenerateDkim={handleGenerateDkim}
                            generatingDkim={generatingDkim}
                        />

                    </div>
                </div>
            </div>
        </div>
    )
}
