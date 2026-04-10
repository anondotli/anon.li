"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
    Trash2, Copy, Check, Mail, ChevronDown, ChevronUp,
    Shield, ShieldCheck, Star, Clock, RefreshCw, AlertTriangle
} from "lucide-react"
import { setDefaultRecipient, resendVerificationAction, deleteRecipientAction } from "@/actions/recipient"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogTrigger,
    DialogClose,
} from "@/components/ui/dialog"
import {
    Collapsible,
    CollapsibleContent,
} from "@/components/ui/collapsible"
import { toast } from "sonner"
import { formatRelativeTime } from "@/lib/utils"
import { RecipientPgpDialog } from "./recipient-pgp-dialog"

interface Recipient {
    id: string
    email: string
    verified: boolean
    isDefault: boolean
    pgpPublicKey: string | null
    pgpFingerprint: string | null
    pgpKeyName: string | null
    createdAt: Date
    scheduledForRemovalAt?: Date | null
    _count: { aliases: number }
}

interface RecipientItemProps {
    recipient: Recipient
}

export function RecipientItem({ recipient }: RecipientItemProps) {
    const [isPending, startTransition] = useTransition()
    const [hasCopied, setHasCopied] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [isPgpDialogOpen, setIsPgpDialogOpen] = useState(false)
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)

    const handleCopyEmail = async () => {
        try {
            await navigator.clipboard.writeText(recipient.email)
            setHasCopied(true)
            toast.success("Copied to clipboard")
            setTimeout(() => setHasCopied(false), 2000)
        } catch {
            toast.error("Failed to copy")
        }
    }

    const handleSetDefault = async () => {
        startTransition(async () => {
            const result = await setDefaultRecipient(recipient.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Default recipient updated")
            }
        })
    }

    const handleResendVerification = async () => {
        startTransition(async () => {
            const result = await resendVerificationAction(recipient.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Verification email sent")
            }
        })
    }

    const handleDelete = async () => {
        startTransition(async () => {
            const result = await deleteRecipientAction(recipient.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Recipient deleted")
                setIsDeleteDialogOpen(false)
            }
        })
    }

    const formatFingerprint = (fingerprint: string) => {
        return fingerprint.toUpperCase().match(/.{1,4}/g)?.join(" ") || fingerprint
    }

    const handleCardClick = (e: React.MouseEvent) => {
        // Don't toggle if clicking on a button or interactive element
        const target = e.target as HTMLElement
        if (target.closest('button') || target.closest('a') || target.closest('[role="button"]')) {
            return
        }
        setIsExpanded(!isExpanded)
    }

    return (
        <>
            <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
                <div className="border rounded-xl bg-card overflow-hidden">
                    {/* Main Row - Clickable */}
                    <div
                        className="p-4 cursor-pointer hover:bg-muted/50 transition-colors"
                        onClick={handleCardClick}
                    >
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                            {/* Email info */}
                            <div className="flex items-start sm:items-center gap-3 min-w-0 flex-1">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={(e) => { e.stopPropagation(); handleCopyEmail(); }}
                                    className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0"
                                    aria-label={`Copy ${recipient.email}`}
                                >
                                    {hasCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                                </Button>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="break-all text-sm font-semibold sm:text-base">
                                            {recipient.email}
                                        </span>
                                        {recipient.isDefault && (
                                            <Badge variant="default" className="text-xs shrink-0">
                                                <Star className="h-3 w-3 mr-1" />
                                                Default
                                            </Badge>
                                        )}
                                        {!recipient.verified && (
                                            <Badge variant="outline" className="text-xs shrink-0 text-amber-600 border-amber-300">
                                                <Clock className="h-3 w-3 mr-1" />
                                                Pending
                                            </Badge>
                                        )}
                                        {recipient.verified && recipient.pgpPublicKey && (
                                            <Badge variant="secondary" className="text-xs shrink-0 text-green-600">
                                                <ShieldCheck className="h-3 w-3 mr-1" />
                                                PGP
                                            </Badge>
                                        )}
                                        {recipient.scheduledForRemovalAt && (
                                            <Badge variant="destructive" className="text-xs shrink-0">
                                                <AlertTriangle className="h-3 w-3 mr-1" />
                                                Removal scheduled
                                            </Badge>
                                        )}
                                    </div>
                                    <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground sm:text-sm">
                                        <span className="flex items-center gap-1 shrink-0">
                                            <Mail className="h-3 w-3" />
                                            {recipient._count.aliases} alias{recipient._count.aliases !== 1 ? "es" : ""}
                                        </span>
                                        <span className="hidden sm:inline text-muted-foreground/50">•</span>
                                        <span className="shrink-0">
                                            Added {formatRelativeTime(recipient.createdAt)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Actions */}
                            <div className="flex w-full flex-wrap items-center gap-2 pl-11 sm:w-auto sm:justify-end sm:pl-0 shrink-0">
                                {/* Verification status */}
                                {recipient.verified ? (
                                    <Badge variant="outline" className="border-green-300 text-green-600">
                                        <Check className="h-3 w-3 mr-1" />
                                        Verified
                                    </Badge>
                                ) : (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); handleResendVerification(); }}
                                        disabled={isPending}
                                        className="flex-1 sm:flex-none"
                                    >
                                        <RefreshCw className={`h-3 w-3 mr-1 ${isPending ? "animate-spin" : ""}`} />
                                        Resend
                                    </Button>
                                )}
                                
                                {/* Set Default button - only for verified non-default recipients */}
                                {recipient.verified && !recipient.isDefault && (
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => { e.stopPropagation(); handleSetDefault(); }}
                                        disabled={isPending}
                                        className="flex-1 sm:flex-none"
                                    >
                                        <Star className="h-3 w-3 mr-1" />
                                        Set Default
                                    </Button>
                                )}

                                <div className="ml-auto text-muted-foreground sm:ml-0">
                                    {isExpanded ? (
                                        <ChevronUp className="h-4 w-4" />
                                    ) : (
                                        <ChevronDown className="h-4 w-4" />
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Expanded Details */}
                    <CollapsibleContent>
                        <div className="border-t px-4 py-3 space-y-3 bg-muted/30">
                            {/* Statistics */}
                            <div className="grid gap-3 text-sm sm:grid-cols-3">
                                <div>
                                    <div className="text-muted-foreground">Status</div>
                                    <div className="font-medium">
                                        {recipient.verified ? "Verified" : "Pending verification"}
                                    </div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Aliases using this</div>
                                    <div className="font-medium">{recipient._count.aliases}</div>
                                </div>
                                <div>
                                    <div className="text-muted-foreground">Added</div>
                                    <div className="font-medium">
                                        {formatRelativeTime(recipient.createdAt)}
                                    </div>
                                </div>
                            </div>

                            {/* PGP Key Info */}
                            {recipient.verified && (
                                <div className="rounded-lg border bg-background p-3 text-sm">
                                    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                        <div className="min-w-0 flex-1">
                                            {recipient.pgpPublicKey ? (
                                                <div className="flex flex-wrap items-center gap-2">
                                                    <ShieldCheck className="h-4 w-4 shrink-0 text-green-600" />
                                                    <span className="font-medium">PGP Encryption</span>
                                                    {recipient.pgpKeyName && (
                                                        <Badge variant="secondary" className="text-xs">
                                                            {recipient.pgpKeyName}
                                                        </Badge>
                                                    )}
                                                    {recipient.pgpFingerprint && (
                                                        <span className="w-full break-all font-mono text-xs text-muted-foreground">
                                                            {formatFingerprint(recipient.pgpFingerprint)}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <div className="flex items-center gap-2">
                                                    <Shield className="h-4 w-4 shrink-0 text-muted-foreground" />
                                                    <span className="text-muted-foreground">No PGP encryption</span>
                                                </div>
                                            )}
                                        </div>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setIsPgpDialogOpen(true)}
                                            className="w-full text-xs sm:w-auto"
                                        >
                                            {recipient.pgpPublicKey ? "Manage" : "Add Key"}
                                        </Button>
                                    </div>
                                </div>
                            )}

                            {/* Delete Button */}
                            {!recipient.isDefault && (
                                <div className="pt-2 border-t">
                                    <Dialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                                        <DialogTrigger asChild>
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                className="w-full justify-start text-destructive hover:bg-destructive/10 hover:text-destructive sm:w-auto"
                                            >
                                                <Trash2 className="h-4 w-4 mr-2" />
                                                Delete Recipient
                                            </Button>
                                        </DialogTrigger>
                                        <DialogContent className="max-w-[calc(100vw-2rem)]">
                                            <DialogHeader>
                                                <DialogTitle>Delete Recipient</DialogTitle>
                                                <DialogDescription>
                                                    {recipient._count.aliases > 0 ? (
                                                        <>
                                                            This recipient has <strong>{recipient._count.aliases}</strong> active alias{recipient._count.aliases !== 1 ? "es" : ""}.
                                                            You must reassign or delete them before removing this recipient.
                                                        </>
                                                    ) : (
                                                        <>
                                                            Are you sure you want to delete <strong>{recipient.email}</strong>?
                                                            This action cannot be undone.
                                                        </>
                                                    )}
                                                </DialogDescription>
                                            </DialogHeader>
                                            <DialogFooter className="gap-2">
                                                <DialogClose asChild>
                                                    <Button type="button" variant="secondary" className="w-full sm:w-auto">
                                                        Cancel
                                                    </Button>
                                                </DialogClose>
                                                <Button
                                                    onClick={handleDelete}
                                                    variant="destructive"
                                                    disabled={isPending || recipient._count.aliases > 0}
                                                    className="w-full sm:w-auto"
                                                >
                                                    Delete
                                                </Button>
                                            </DialogFooter>
                                        </DialogContent>
                                    </Dialog>
                                </div>
                            )}
                        </div>
                    </CollapsibleContent>
                </div>
            </Collapsible>

            <RecipientPgpDialog
                recipient={recipient}
                open={isPgpDialogOpen}
                onOpenChange={setIsPgpDialogOpen}
            />
        </>
    )
}
