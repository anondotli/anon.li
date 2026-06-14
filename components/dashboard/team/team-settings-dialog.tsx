"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { setOrgEnforce2FA } from "@/actions/org-settings"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
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
import { buttonVariants } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import { Check, DoorOpen, KeyRound, Loader2, Trash2 } from "lucide-react"

interface TeamSettingsDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    organizationId: string
    name: string
    slug: string | null | undefined
    /** Owner/admin — may rename the team. */
    canManage: boolean
    /** Owner — may delete the team (and cannot leave it). */
    isOwner: boolean
    /** Deleting is blocked while a subscription is active (it would keep billing). */
    hasActiveSubscription: boolean
    /** Org-wide 2FA enforcement policy (owner can toggle). */
    enforce2FA: boolean
    /** Rotate the team's shared encryption key (owns the vault key, so lives in the parent). */
    onRotateKeys: () => Promise<void> | void
    /** A rotation is currently in flight. */
    rotating: boolean
    /** A member was removed since the last rotation — rotating is recommended. */
    keyRotationRecommended: boolean
    /** The user's vault is unlocked (required to rotate). */
    vaultUnlocked: boolean
    /** Current shared-key generation (0 = not yet initialized). */
    keyGeneration: number
    /** Refetch the org after a successful change. */
    onSaved: () => Promise<void> | void
}

/**
 * Team settings: rename (owner/admin), plus the danger zone — members and
 * admins may leave the team; the owner may delete it after typing its name to
 * confirm. Deletion is blocked while a subscription is active so a team can't
 * be deleted out from under its own billing.
 */
export function TeamSettingsDialog({
    open,
    onOpenChange,
    organizationId,
    name,
    slug,
    canManage,
    isOwner,
    hasActiveSubscription,
    enforce2FA,
    onRotateKeys,
    rotating,
    keyRotationRecommended,
    vaultUnlocked,
    keyGeneration,
    onSaved,
}: TeamSettingsDialogProps) {
    const router = useRouter()
    const [draftName, setDraftName] = useState(name)
    const [saving, setSaving] = useState(false)
    const [deleteConfirm, setDeleteConfirm] = useState("")
    const [busy, setBusy] = useState(false)
    const [twoFa, setTwoFa] = useState(enforce2FA)
    const [twoFaSaving, setTwoFaSaving] = useState(false)

    const toggleEnforce2FA = async () => {
        const next = !twoFa
        setTwoFaSaving(true)
        try {
            const res = await setOrgEnforce2FA({ enforce2FA: next })
            if (res?.error) {
                toast.error(res.error)
                return
            }
            setTwoFa(next)
            toast.success(next ? "Two-factor is now required for the team" : "Two-factor requirement removed")
            await onSaved()
        } finally {
            setTwoFaSaving(false)
        }
    }

    const reset = () => {
        setDraftName(name)
        setDeleteConfirm("")
    }

    const rename = async (e: React.FormEvent) => {
        e.preventDefault()
        const next = draftName.trim()
        if (!next || next === name) return
        setSaving(true)
        try {
            const { error } = await authClient.organization.update({
                organizationId,
                data: { name: next },
            })
            if (error) {
                toast.error(error.message || "Failed to rename team")
                return
            }
            toast.success("Team renamed")
            await onSaved()
        } finally {
            setSaving(false)
        }
    }

    const switchToPersonalAndExit = async (message: string) => {
        await authClient.organization.setActive({ organizationId: null })
        toast.success(message)
        onOpenChange(false)
        router.push("/dashboard")
        router.refresh()
    }

    const leave = async () => {
        setBusy(true)
        try {
            const { error } = await authClient.organization.leave({ organizationId })
            if (error) {
                toast.error(error.message || "Failed to leave team")
                return
            }
            await switchToPersonalAndExit("You've left the team")
        } finally {
            setBusy(false)
        }
    }

    const deleteTeam = async () => {
        if (deleteConfirm !== name) return
        setBusy(true)
        try {
            const { error } = await authClient.organization.delete({ organizationId })
            if (error) {
                toast.error(error.message || "Failed to delete team")
                return
            }
            await switchToPersonalAndExit("Team deleted")
        } finally {
            setBusy(false)
        }
    }

    return (
        <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset() }}>
            <DialogContent className="sm:max-w-[480px]">
                <DialogHeader>
                    <DialogTitle className="font-serif text-xl font-medium">Team settings</DialogTitle>
                    <DialogDescription>
                        Changes apply to every member of the team.
                    </DialogDescription>
                </DialogHeader>

                <div className="space-y-6">
                    <form onSubmit={rename} className="space-y-3">
                        <div className="space-y-1.5">
                            <Label htmlFor="settings-team-name">Team name</Label>
                            <div className="flex gap-2">
                                <Input
                                    id="settings-team-name"
                                    value={draftName}
                                    onChange={(e) => setDraftName(e.target.value)}
                                    disabled={!canManage || saving}
                                    placeholder="Acme Inc"
                                    required
                                />
                                {canManage && (
                                    <Button
                                        type="submit"
                                        variant="outline"
                                        disabled={saving || !draftName.trim() || draftName.trim() === name}
                                    >
                                        {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                        Save
                                    </Button>
                                )}
                            </div>
                            {slug && (
                                <p className="text-xs text-muted-foreground">
                                    Team ID: <span className="font-mono">{slug}</span>
                                </p>
                            )}
                            {!canManage && (
                                <p className="text-xs text-muted-foreground">
                                    Only team owners and admins can rename the team.
                                </p>
                            )}
                        </div>
                    </form>

                    {/* Security (owner only) */}
                    {isOwner && (
                        <div className="flex items-start justify-between gap-3 rounded-xl border p-4">
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Require two-factor authentication</p>
                                <p className="text-xs text-muted-foreground">
                                    Every member must have 2FA enabled and verified to use the team.
                                    Enable 2FA on your own account first.
                                </p>
                            </div>
                            <Button
                                variant={twoFa ? "default" : "outline"}
                                size="sm"
                                className="shrink-0"
                                onClick={toggleEnforce2FA}
                                disabled={twoFaSaving}
                                aria-pressed={twoFa}
                            >
                                {twoFaSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                                {twoFa ? "Required" : "Not required"}
                            </Button>
                        </div>
                    )}

                    {/* Encryption key (owner/admin) */}
                    {canManage && (
                        <div className="space-y-3 rounded-xl border p-4">
                            <div className="flex items-start gap-3">
                                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                    <KeyRound className="h-4 w-4" />
                                </div>
                                <div className="space-y-1">
                                    <p className="text-sm font-medium">Team encryption key</p>
                                    <p className="text-xs text-muted-foreground">
                                        Rotating re-encrypts every shared Drop and Form, re-shares the key with
                                        current members, and permanently revokes anyone who has been removed.
                                        Existing data is preserved — this can&apos;t be undone.
                                    </p>
                                </div>
                            </div>

                            <p className="text-xs text-muted-foreground">
                                {keyGeneration > 0 ? (
                                    <>
                                        Current key generation:{" "}
                                        <span className="font-medium tabular-nums text-foreground">{keyGeneration}</span>
                                    </>
                                ) : (
                                    "Not yet initialized — the key is created when you first share a team resource."
                                )}
                            </p>

                            {keyRotationRecommended && (
                                <div className="flex items-start gap-2 rounded-lg border border-amber-500/20 bg-amber-500/10 px-3 py-2 text-xs text-amber-700 dark:text-amber-400">
                                    <KeyRound className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                                    <span>
                                        A member was removed — rotation is recommended to fully revoke their access.
                                    </span>
                                </div>
                            )}

                            <AlertDialog>
                                <AlertDialogTrigger asChild>
                                    <Button variant="outline" size="sm" disabled={rotating || !vaultUnlocked}>
                                        {rotating ? (
                                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                        ) : (
                                            <KeyRound className="mr-2 h-4 w-4" />
                                        )}
                                        Rotate key…
                                    </Button>
                                </AlertDialogTrigger>
                                <AlertDialogContent>
                                    <AlertDialogHeader>
                                        <AlertDialogTitle>Rotate the team encryption key?</AlertDialogTitle>
                                        <AlertDialogDescription>
                                            This generates a new shared key, re-encrypts every shared Drop and Form,
                                            and re-shares it with all current members. Anyone removed from the team
                                            permanently loses access. This can&apos;t be undone.
                                        </AlertDialogDescription>
                                    </AlertDialogHeader>
                                    <AlertDialogFooter>
                                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                                        <AlertDialogAction onClick={() => { void onRotateKeys() }}>
                                            Rotate key
                                        </AlertDialogAction>
                                    </AlertDialogFooter>
                                </AlertDialogContent>
                            </AlertDialog>

                            {!vaultUnlocked && (
                                <p className="text-xs text-muted-foreground">
                                    Unlock your vault to rotate the team key.
                                </p>
                            )}
                        </div>
                    )}

                    {/* Danger zone */}
                    <div className="rounded-xl border border-destructive/20 bg-destructive/5 p-4">
                        <p className="text-sm font-medium text-destructive">Danger zone</p>
                        {!isOwner && (
                            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                                <p className="text-sm text-muted-foreground">
                                    Leave this team. You&apos;ll lose access to its shared resources.
                                </p>
                                <AlertDialog>
                                    <AlertDialogTrigger asChild>
                                        <Button variant="outline" size="sm" className="shrink-0 border-destructive/30 text-destructive hover:bg-destructive/10 hover:text-destructive" disabled={busy}>
                                            <DoorOpen className="mr-2 h-4 w-4" /> Leave team
                                        </Button>
                                    </AlertDialogTrigger>
                                    <AlertDialogContent>
                                        <AlertDialogHeader>
                                            <AlertDialogTitle>Leave {name}?</AlertDialogTitle>
                                            <AlertDialogDescription>
                                                You&apos;ll immediately lose access to the team&apos;s shared aliases, drops,
                                                and forms. An owner or admin can invite you back later.
                                            </AlertDialogDescription>
                                        </AlertDialogHeader>
                                        <AlertDialogFooter>
                                            <AlertDialogCancel>Stay</AlertDialogCancel>
                                            <AlertDialogAction
                                                className={cn(buttonVariants({ variant: "destructive" }))}
                                                onClick={leave}
                                            >
                                                Leave team
                                            </AlertDialogAction>
                                        </AlertDialogFooter>
                                    </AlertDialogContent>
                                </AlertDialog>
                            </div>
                        )}

                        {isOwner && (
                            hasActiveSubscription ? (
                                <p className="text-sm text-muted-foreground">
                                    This team has an active subscription. Cancel it with
                                    {" "}<span className="text-foreground">Manage billing</span>{" "}
                                    on the team page before deleting the team.
                                </p>
                            ) : (
                                <div className="space-y-3">
                                    <p className="text-sm text-muted-foreground">
                                        Permanently delete this team, its memberships, and its shared
                                        resources. This cannot be undone. Type{" "}
                                        <span className="font-medium text-foreground">{name}</span> to confirm.
                                    </p>
                                    <div className="flex gap-2">
                                        <Input
                                            value={deleteConfirm}
                                            onChange={(e) => setDeleteConfirm(e.target.value)}
                                            placeholder={name}
                                            disabled={busy}
                                            aria-label="Type the team name to confirm deletion"
                                            className={cn(deleteConfirm === name && "border-destructive focus-visible:ring-destructive")}
                                        />
                                        <Button
                                            variant="destructive"
                                            className="shrink-0"
                                            disabled={busy || deleteConfirm !== name}
                                            onClick={deleteTeam}
                                        >
                                            {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Trash2 className="mr-2 h-4 w-4" />}
                                            Delete
                                        </Button>
                                    </div>
                                    {deleteConfirm.length > 0 && (
                                        deleteConfirm === name ? (
                                            <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                                                <Check className="h-3.5 w-3.5" /> Name matches — this will permanently delete the team.
                                            </p>
                                        ) : (
                                            <p className="text-xs text-muted-foreground">
                                                Keep typing the exact team name to enable deletion.
                                            </p>
                                        )
                                    )}
                                </div>
                            )
                        )}
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    )
}
