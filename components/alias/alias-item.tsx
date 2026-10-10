"use client"

import { useState, useTransition } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Badge } from "@/components/ui/badge"
import {
    Trash2, Copy, Check, Mail, Clock, Tag, FileText,
    MoreHorizontal, ShieldCheck, Forward, AlertTriangle,
    ChevronDown, ChevronUp,
} from "lucide-react"
import { toggleAliasAction, deleteAliasAction, updateAliasAction } from "@/actions/alias"
import { useVault } from "@/components/vault/vault-provider"
import { AliasMetadataKeyError } from "@/components/alias/alias-metadata-key"
import { saveAliasMetadata } from "@/components/alias/alias-metadata-write"
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
import { formatRelativeTime } from "@/lib/format"
import { useClipboard } from "@/hooks/use-clipboard"

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
        /** Set when an admin took the alias down; the owner can't re-enable it. */
        takenDownAt?: Date | null
        organizationId?: string | null
        /** Full forwarding list (join table), ordered; primary first. */
        aliasRecipients?: {
            isPrimary: boolean
            recipient: { id: string; email: string; pgpPublicKey: string | null }
        }[]
    }
    metadata: {
        label: string | null
        note: string | null
        labelStatus: "empty" | "decrypted" | "legacy" | "error"
        noteStatus: "empty" | "decrypted" | "legacy" | "error"
    }
    recipients?: Recipient[]
    /** False for plain team members: changing forwarding is admin+ on the server. */
    canManage?: boolean
}

export function AliasItem({ alias, metadata, recipients = [], canManage = true }: AliasItemProps) {
    const router = useRouter()
    const vault = useVault()
    const isTakenDown = Boolean(alias.takenDownAt)
    const takenDownId = `alias-taken-down-${alias.id}`
    const [isPending, startTransition] = useTransition()
    const { copied: hasCopied, copy } = useClipboard()
    const [isExpanded, setIsExpanded] = useState(false)
    const [isEditingLabel, setIsEditingLabel] = useState(false)
    const [isEditingNote, setIsEditingNote] = useState(false)
    const [isEditingRecipient, setIsEditingRecipient] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [label, setLabel] = useState("")
    const [note, setNote] = useState("")

    // Full forwarding list from the join table (an alias can forward to several
    // recipients via the API); fall back to the legacy single recipient.
    const legacyRecipient = alias.recipient || recipients.find(r => r.id === alias.recipientId)
    const forwardingRecipients = alias.aliasRecipients && alias.aliasRecipients.length > 0
        ? alias.aliasRecipients.map((row) => row.recipient)
        : legacyRecipient ? [legacyRecipient] : []
    const currentRecipient = forwardingRecipients[0]
    const recipientEmail = currentRecipient?.email || "Unknown"
    const extraRecipientCount = Math.max(forwardingRecipients.length - 1, 0)
    const hasRecipient = forwardingRecipients.length > 0

    const [selectedRecipientIds, setSelectedRecipientIds] = useState<string[]>(
        () => forwardingRecipients.map((r) => r.id),
    )

    const startEditingRecipients = () => {
        setSelectedRecipientIds(forwardingRecipients.map((r) => r.id))
        setIsEditingRecipient(true)
        setIsEditingLabel(false)
        setIsEditingNote(false)
        setIsExpanded(true)
    }

    const toggleSelectedRecipient = (recipientId: string, checked: boolean) => {
        setSelectedRecipientIds((current) => checked
            ? current.includes(recipientId) ? current : [...current, recipientId]
            : current.filter((id) => id !== recipientId))
    }

    // Recipients this alias forwards to that aren't in the selectable (verified)
    // list still need a row, so editing never silently drops them.
    const editableRecipients = [
        ...recipients,
        ...forwardingRecipients
            .filter((fr) => !recipients.some((r) => r.id === fr.id))
            .map((fr) => ({ ...fr, verified: true, isDefault: false })),
    ]

    const handleCopy = async () => {
        if (await copy(alias.email)) {
            toast.success("Copied to clipboard")
        } else {
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

    // Org aliases are encrypted to the team key so every member can read them;
    // saveAliasMetadata handles key selection and a stale-team-key retry.
    const saveMetadata = async (fields: { label?: string | null; note?: string | null }) => {
        try {
            return await saveAliasMetadata(vault, alias, fields, {
                ...(fields.label !== undefined && { clearLegacyLabel: true }),
                ...(fields.note !== undefined && { clearLegacyNote: true }),
            })
        } catch (error) {
            return {
                error: error instanceof AliasMetadataKeyError
                    ? error.message
                    : "Unlock your vault to update labels and notes",
            }
        }
    }

    const handleSaveLabel = () => {
        startTransition(async () => {
            const trimmedLabel = label.trim()
            const result = await saveMetadata({ label: trimmedLabel || null })
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
            const result = await saveMetadata({ note: trimmedNote || null })
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
        if (selectedRecipientIds.length === 0) {
            toast.error("Select at least one recipient")
            return
        }
        startTransition(async () => {
            const result = await updateAliasAction(alias.id, { recipientIds: selectedRecipientIds })
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
                                {isTakenDown && (
                                    <Badge variant="destructive" className="text-xs shrink-0">
                                        <AlertTriangle className="h-3 w-3 mr-1" />
                                        Disabled by anon.li
                                    </Badge>
                                )}
                            </div>
                            {isTakenDown && (
                                <p id={takenDownId} className="mt-1 text-xs text-destructive">
                                    This alias was disabled by anon.li for violating our terms of service and can&apos;t be re-enabled.
                                </p>
                            )}
                            <div className="flex items-center gap-2 sm:gap-3 text-xs sm:text-sm text-muted-foreground mt-1">
                                {!hasRecipient && alias.active ? (
                                    <span className="flex items-center gap-1 text-amber-600 dark:text-amber-500">
                                        <AlertTriangle className="h-3 w-3 shrink-0" />
                                        No recipient - emails won&apos;t be forwarded
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-1 truncate max-w-[150px] sm:max-w-none">
                                        <Forward className="h-3 w-3 shrink-0" />
                                        <span className="truncate">{recipientEmail}</span>
                                        {currentRecipient?.pgpPublicKey && (
                                            <ShieldCheck className="h-3 w-3 text-green-600 shrink-0" />
                                        )}
                                        {extraRecipientCount > 0 && (
                                            <span className="shrink-0">+{extraRecipientCount}</span>
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
                                    {alias.active ? 'Active' : isTakenDown ? 'Disabled' : 'Paused'}
                                </span>
                                <Switch
                                    checked={alias.active}
                                    onCheckedChange={handleToggle}
                                    disabled={isPending || (isTakenDown && !alias.active)}
                                    aria-label={alias.active ? "Pause alias" : "Activate alias"}
                                    aria-describedby={isTakenDown ? takenDownId : undefined}
                                />
                            </div>

                            {/* Mobile: switch */}
                            <Switch
                                checked={alias.active}
                                onCheckedChange={handleToggle}
                                disabled={isPending || (isTakenDown && !alias.active)}
                                aria-label={alias.active ? "Pause alias" : "Activate alias"}
                                aria-describedby={isTakenDown ? takenDownId : undefined}
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
                                    {canManage && recipients.length > 0 && (
                                        <DropdownMenuItem onClick={startEditingRecipients}>
                                            <Forward className="h-4 w-4 mr-2" />
                                            Change forwarding
                                        </DropdownMenuItem>
                                    )}
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

                            <Button
                                type="button"
                                variant="ghost"
                                size="icon"
                                className="h-8 w-8 text-muted-foreground"
                                aria-label={isExpanded ? "Collapse alias details" : "Expand alias details"}
                                aria-expanded={isExpanded}
                                onClick={() => setIsExpanded((value) => !value)}
                            >
                                {isExpanded
                                    ? <ChevronUp className="h-4 w-4" />
                                    : <ChevronDown className="h-4 w-4" />}
                            </Button>
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
                        {canManage && isEditingRecipient && (
                            <fieldset className="space-y-2">
                                <legend className="text-sm font-medium">Forward to</legend>
                                <p className="text-xs text-muted-foreground">
                                    The first selected recipient is the primary.
                                </p>
                                <div className="space-y-1">
                                    {editableRecipients.map(r => {
                                        const position = selectedRecipientIds.indexOf(r.id)
                                        return (
                                            <label
                                                key={r.id}
                                                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-background cursor-pointer"
                                            >
                                                <input
                                                    type="checkbox"
                                                    className="h-4 w-4 accent-primary"
                                                    checked={position !== -1}
                                                    onChange={(e) => toggleSelectedRecipient(r.id, e.target.checked)}
                                                />
                                                <span className="break-all">{r.email}</span>
                                                {r.isDefault && (
                                                    <span className="text-xs text-muted-foreground">(Default)</span>
                                                )}
                                                {r.pgpPublicKey && (
                                                    <ShieldCheck className="h-3 w-3 text-green-600 shrink-0" />
                                                )}
                                                {position === 0 && (
                                                    <Badge variant="secondary" className="text-xs ml-auto">Primary</Badge>
                                                )}
                                            </label>
                                        )
                                    })}
                                </div>
                                <div className="flex gap-2">
                                    <Button size="sm" onClick={handleSaveRecipient} disabled={isPending || selectedRecipientIds.length === 0}>
                                        Save
                                    </Button>
                                    <Button
                                        size="sm"
                                        variant="ghost"
                                        onClick={() => {
                                            setSelectedRecipientIds(forwardingRecipients.map((r) => r.id))
                                            setIsEditingRecipient(false)
                                        }}
                                    >
                                        Cancel
                                    </Button>
                                </div>
                            </fieldset>
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
                            <div className="flex items-start gap-2 text-foreground bg-background rounded-md p-2 border">
                                <Forward className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
                                <ul className="min-w-0 flex-1 space-y-1">
                                    {forwardingRecipients.length === 0 ? (
                                        <li className="text-muted-foreground">No recipient</li>
                                    ) : forwardingRecipients.map((r, index) => (
                                        <li key={r.id} className="flex flex-wrap items-center gap-2">
                                            <span className="break-all">{r.email}</span>
                                            {forwardingRecipients.length > 1 && index === 0 && (
                                                <Badge variant="outline" className="text-xs">Primary</Badge>
                                            )}
                                            {r.pgpPublicKey && (
                                                <Badge variant="secondary" className="text-xs text-green-600">
                                                    <ShieldCheck className="h-3 w-3 mr-1" />
                                                    PGP Encrypted
                                                </Badge>
                                            )}
                                        </li>
                                    ))}
                                </ul>
                                {canManage && recipients.length > 0 && !isEditingRecipient && (
                                    <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-7 text-xs shrink-0"
                                        onClick={startEditingRecipients}
                                    >
                                        Change
                                    </Button>
                                )}
                            </div>
                            {!canManage && (
                                <p className="mt-1 text-xs text-muted-foreground">
                                    Only team admins can change where this alias forwards.
                                </p>
                            )}
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
