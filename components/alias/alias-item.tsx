"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import {
    Trash2, Copy, Check, Mail, Clock, Tag, FileText,
    MoreHorizontal, ShieldCheck, Forward, AlertTriangle
} from "lucide-react"
import { toggleAliasAction, deleteAliasAction, updateAliasAction, updateAliasEncryptedMetadataAction } from "@/actions/alias"
import { useVault } from "@/components/vault/vault-provider"
import { encryptVaultText } from "@/lib/vault/crypto"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
    DialogClose,
} from "@/components/ui/dialog"
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
    Collapsible,
    CollapsibleContent,
} from "@/components/ui/collapsible"
import { toast } from "sonner"
import { formatRelativeTime } from "@/lib/utils"

interface Recipient {
    id: string
    email: string
    verified: boolean
    isDefault: boolean
    pgpPublicKey: string | null
}

interface AliasItemProps {
    alias: {
        id: string
        email: string
        recipientId: string | null
        recipient?: {
            id: string
            email: string
            pgpPublicKey: string | null
        } | null
        active: boolean
        legacyLabel?: string | null
        legacyNote?: string | null
        encryptedLabel?: string | null
        encryptedNote?: string | null
        emailsReceived: number
        emailsBlocked: number
        lastEmailAt?: Date | null
        createdAt: Date
        scheduledForRemovalAt?: Date | null
    }
    metadata: {
        label: string | null
        note: string | null
        labelStatus: "empty" | "decrypted" | "legacy" | "error"
        noteStatus: "empty" | "decrypted" | "legacy" | "error"
    }
    recipients?: Recipient[]
}

export function AliasItem({ alias, metadata, recipients = [] }: AliasItemProps) {
    const router = useRouter()
    const vault = useVault()
    const [isPending, startTransition] = useTransition()
    const [hasCopied, setHasCopied] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [isEditingNote, setIsEditingNote] = useState(false)
    const [isEditingRecipient, setIsEditingRecipient] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [label, setLabel] = useState("")
    const [note, setNote] = useState("")
    const [selectedRecipientId, setSelectedRecipientId] = useState(alias.recipientId || "")

    // Find current recipient from the alias's recipient or from recipients list
    const currentRecipient = alias.recipient || recipients.find(r => r.id === alias.recipientId)
    const recipientEmail = currentRecipient?.email || "Unknown"

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(alias.email)
            setHasCopied(true)
            toast.success("Copied to clipboard")
            setTimeout(() => setHasCopied(false), 2000)
        } catch {
            toast.error("Failed to copy")
        }
    }

    const handleToggle = () => {
        startTransition(async () => {
            const result = await toggleAliasAction(alias.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(alias.active ? "Alias paused" : "Alias activated")
            }
        })
    }

    const handleDelete = () => {
        startTransition(async () => {
            const result = await deleteAliasAction(alias.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Alias deleted")
            }
        })
    }

    const handleSaveLabel = () => {
        startTransition(async () => {
            const trimmedLabel = label.trim()
            const vaultKey = vault.getVaultKey()
            if (vault.status !== "unlocked" || !vaultKey) {
                toast.error("Unlock your vault to update labels")
                return
            }

            const encryptedLabel = trimmedLabel
                ? await encryptVaultText(trimmedLabel, vaultKey, {
                    aliasId: alias.id,
                    field: "label",
                })
                : null

            const result = await updateAliasEncryptedMetadataAction(alias.id, {
                encryptedLabel,
                clearLegacyLabel: true,
            })
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Label updated")
                setIsEditingLabel(false)
                router.refresh()
            }
        })
    }

    const handleSaveNote = () => {
        startTransition(async () => {
            const trimmedNote = note.trim()
            const vaultKey = vault.getVaultKey()
            if (vault.status !== "unlocked" || !vaultKey) {
                toast.error("Unlock your vault to update notes")
                return
            }

            const encryptedNote = trimmedNote
                ? await encryptVaultText(trimmedNote, vaultKey, {
                    aliasId: alias.id,
                    field: "note",
                })
                : null

            const result = await updateAliasEncryptedMetadataAction(alias.id, {
                encryptedNote,
                clearLegacyNote: true,
            })
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Note updated")
                setIsEditingNote(false)
                router.refresh()
            }
        })
    }

    const handleSaveRecipient = () => {
        if (!selectedRecipientId) {
            toast.error("Please select a recipient")
            return
        }
        startTransition(async () => {
            const result = await updateAliasAction(alias.id, { recipientId: selectedRecipientId })
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Forwarding address updated")
                setIsEditingRecipient(false)
                router.refresh()
            }
        })
    }

    const formatLastEmail = () => {
        if (!alias.lastEmailAt) return "Never"
        return formatRelativeTime(alias.lastEmailAt)
    }

    return (
        <Collapsible open={isExpanded} onOpenChange={setIsExpanded}>
            <div className="border rounded-xl bg-card overflow-hidden">
                {/* Main Row */}
                <div className="p-4">
                    <div className="flex items-start gap-3">
                        {/* Copy button */}
                        <Button
                            variant="ghost"
                            size="icon"
                            onClick={handleCopy}
                            className="h-8 w-8 text-muted-foreground hover:text-foreground shrink-0 mt-0.5 sm:mt-0"
                            aria-label={`Copy ${alias.email}`}
                        >
                            {hasCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
                        </Button>

                        {/* Email info */}
                        <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                                <span className="font-semibold text-sm sm:text-base break-all sm:truncate">{alias.email}</span>
                                {metadata.label && (
                                    <Badge variant="secondary" className="text-xs shrink-0">
                                        <Tag className="h-3 w-3 mr-1" />
                                        {metadata.label}
                                    </Badge>
                                )}
                                {(metadata.labelStatus === "error" || metadata.noteStatus === "error") && (
                                    <Badge variant="outline" className="text-xs shrink-0">
                                        Metadata locked
                                    </Badge>
                                )}
                                {alias.scheduledForRemovalAt && (
                                    <Badge variant="destructive" className="text-xs shrink-0">
                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                        Removal scheduled
                                    </Badge>
                                )}
                            </div>
                            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground mt-1">
                                {!alias.recipientId && alias.active ? (
                                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                        No recipient - emails won&apos;t be forwarded
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 truncate max-w-[150px] sm:max-w-none">
                                        <Forward className="h-3 w-3 shrink-0" />
                                        {recipientEmail}
                                        {currentRecipient?.pgpPublicKey && (
                                            <ShieldCheck className="h-3 w-3 text-green-600 shrink-0" />
                                        )}
                                    </span>
                                )}
                                <span className="flex items-center gap-1 shrink-0">
                                    <Mail className="h-3 w-3" />
                                    {alias.emailsReceived}
                                </span>
                                {alias.lastEmailAt && (
                                    <span className="flex items-center gap-1 shrink-0 hidden sm:flex">
                                        <Clock className="h-3 w-3" />
                                        {formatLastEmail()}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Right controls */}
                        <div className="flex flex-col sm:flex-row shrink-0 items-center gap-1 sm:gap-2">
                            {/* Desktop: Active/Paused label + switch */}
                            <div className="hidden sm:flex items-center gap-2">
                                <span className="text-sm text-muted-foreground">
                                    {alias.active ? 'Active' : 'Paused'}
                                </span>
                                <Switch
                                    checked={alias.active}
                                    onCheckedChange={handleToggle}
                                    disabled={isPending}
                                    aria-label={alias.active ? "Pause alias" : "Activate alias"}
                                />
                            </div>

                            {/* Mobile: switch */}
                            <Switch
                                checked={alias.active}
                                onCheckedChange={handleToggle}
                                disabled={isPending}
                                aria-label={alias.active ? "Pause alias" : "Activate alias"}
                                className="sm:hidden"
                            />

                            <DropdownMenu>
                                <DropdownMenuTrigger asChild>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-8 w-8"
                                        aria-label="Alias options"
                                    >
                                        <MoreHorizontal className="h-4 w-4" />
                                    </Button>
                                </DropdownMenuTrigger>
                                <DropdownMenuContent align="end">
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setLabel(metadata.label || "")
                                            setIsEditingLabel(true)
                                            setIsEditingNote(false)
                                            setIsExpanded(true)
                                        }}
                                    >
                                        <Tag className="h-4 w-4 mr-2" />
                                        Edit label
                                    </DropdownMenuItem>
                                    <DropdownMenuItem
                                        onClick={() => {
                                            setNote(metadata.note || "")
                                            setIsEditingNote(true)
                                            setIsEditingLabel(false)
                                            setIsExpanded(true)
                                        }}
                                    >
                                        <FileText className="h-4 w-4 mr-2" />
                                        Edit note
                                    </DropdownMenuItem>
                                    <DropdownMenuSeparator />
                                    <DropdownMenuItem
                                        className="text-destructive focus:text-destructive"
                                        onClick={() => setShowDeleteDialog(true)}
                                    >
                                        <Trash2 className="h-4 w-4 mr-2" />
                                        Delete
                                    </DropdownMenuItem>
                                </DropdownMenuContent>
                            </DropdownMenu>
                        </div>
                    </div>
                </div>

                {/* Expanded Details */}
                <CollapsibleContent>
                    <div className="border-t px-4 py-3 space-y-3 bg-muted/30">
                        {/* Label Edit */}
                        {isEditingLabel && (
                            <div className="space-y-2">
                                <div className="text-sm font-medium">Label</div>
                                <div className="flex gap-2">
                                    <Input
                                        placeholder="Label (e.g., Shopping, Social)"
                                        value={label}
                                        onChange={(e) => setLabel(e.target.value)}
                                        className="flex-1"
                                        maxLength={50}
                                        autoFocus
                                    />
                                    <Button size="sm" onClick={handleSaveLabel} disabled={isPending}>
                                        Save
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setLabel(metadata.label || "")
                                            setIsEditingLabel(false)
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Note Edit */}
                        {isEditingNote && (
                            <div className="space-y-2">
                                <div className="text-sm font-medium">Note</div>
                                <div className="flex gap-2">
                                    <Textarea
                                        placeholder="Add a note..."
                                        value={note}
                                        onChange={(e) => setNote(e.target.value)}
                                        className="flex-1 min-h-[60px] resize-none"
                                        maxLength={500}
                                        rows={2}
                                        autoFocus
                                    />
                                    <div className="flex flex-col gap-1">
                                        <Button size="sm" onClick={handleSaveNote} disabled={isPending}>
                                            Save
                                        </Button>
                                        <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => {
                                                setNote(metadata.note || "")
                                                setIsEditingNote(false)
                                            }}
                                        >
                                            Cancel
                                        </Button>
                                    </div>
                                </div>
                            </div>
                        )}

                        {/* Recipient Edit */}
                        {isEditingRecipient && recipients.length > 1 && (
                            <div className="space-y-2">
                                <div className="text-sm font-medium">Forward to</div>
                                <div className="flex gap-2">
                                    <Select value={selectedRecipientId} onValueChange={setSelectedRecipientId}>
                                        <SelectTrigger className="flex-1">
                                            <SelectValue placeholder="Select recipient" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            {recipients.map(r => (
                                                <SelectItem key={r.id} value={r.id}>
                                                    <div className="flex items-center gap-2">
                                                        <span>{r.email}</span>
                                                        {r.isDefault && (
                                                            <span className="text-xs text-muted-foreground">(Default)</span>
                                                        )}
                                                        {r.pgpPublicKey && (
                                                            <ShieldCheck className="h-3 w-3 text-green-600" />
                                                        )}
                                                    </div>
                                                </SelectItem>
                                            ))}
                                        </SelectContent>
                                    </Select>
                                    <Button size="sm" onClick={handleSaveRecipient} disabled={isPending}>
                                        Save
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setSelectedRecipientId(alias.recipientId || "")
                                            setIsEditingRecipient(false)
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </div>
                        )}

                        {/* Statistics */}
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                            <div>
                                <div className="text-muted-foreground">Received</div>
                                <div className="font-medium">{alias.emailsReceived} emails</div>
                            </div>
                            <div>
                                <div className="text-muted-foreground">Blocked</div>
                                <div className="font-medium">{alias.emailsBlocked} emails</div>
                            </div>
                            <div>
                                <div className="text-muted-foreground">Last Email</div>
                                <div className="font-medium">{formatLastEmail()}</div>
                            </div>
                            <div>
                                <div className="text-muted-foreground">Created</div>
                                <div className="font-medium">
                                    {formatRelativeTime(alias.createdAt)}
                                </div>
                            </div>
                        </div>

                        {/* Forwarding Info */}
                        <div className="text-sm">
                            <div className="text-muted-foreground mb-1">Forwarding to</div>
                            <div className="flex items-center gap-2 text-foreground bg-background rounded-md p-2 border">
                                <Forward className="h-4 w-4 text-muted-foreground" />
                                <span>{recipientEmail}</span>
                                {currentRecipient?.pgpPublicKey && (
                                    <Badge variant="secondary" className="text-xs text-green-600">
                                        <ShieldCheck className="h-3 w-3 mr-1" />
                                        PGP Encrypted
                                    </Badge>
                                )}
                                {recipients.length > 1 && !isEditingRecipient && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="ml-auto h-7 text-xs"
                                        onClick={() => {
                                            setSelectedRecipientId(alias.recipientId || "")
                                            setIsEditingRecipient(true)
                                        }}
                                    >
                                        Change
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </CollapsibleContent>
            </div>

            {/* Delete Confirmation Dialog */}
            <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <DialogContent>
                    <DialogHeader>
                        <DialogTitle>Delete Alias</DialogTitle>
                        <DialogDescription>
                            This action cannot be undone. This will permanently delete
                            <span className="font-semibold text-foreground"> {alias.email}</span>.
                        </DialogDescription>
                    </DialogHeader>
                    <DialogFooter>
                        <DialogClose asChild>
                            <Button type="button" variant="secondary">
                                Cancel
                            </Button>
                        </DialogClose>
                        <Button
                            onClick={handleDelete}
                            variant="destructive"
                            disabled={isPending}
                        >
                            Delete
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </Collapsible>
    )
}
