"use client"

import { useEffect, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { useOptionalVault } from "@/components/vault/vault-provider"
import { bootstrapOrgVault, rotateOrgVaultKey } from "@/lib/vault/org-vault-client"
import { createTeamCheckoutSession } from "@/actions/create-team-checkout"
import { createOrgPortalSession, updateOrgSeats } from "@/actions/manage-org-billing"
import { BUSINESS_PLAN, BUSINESS_SEAT_PRICE, ENTERPRISE_PLAN } from "@/config/plans"
import { formatDate } from "@/lib/format"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { CardRibbon } from "@/components/marketing/pricing/card-ribbon"
import { FeatureItem } from "@/components/marketing/feature-item"
import { EmptyState } from "@/components/ui/empty-state"
import { Skeleton } from "@/components/ui/skeleton"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
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
import { TeamSettingsDialog } from "@/components/dashboard/team/team-settings-dialog"
import { cn } from "@/lib/utils"
import { toast } from "sonner"
import {
    Building2,
    CreditCard,
    Download,
    KeyRound,
    Loader2,
    Minus,
    Plus,
    ScrollText,
    Settings2,
    Sparkles,
    Trash2,
    UserPlus,
    Users,
    X,
} from "lucide-react"

type Role = "owner" | "admin" | "member"

// Yearly per-seat savings vs. paying monthly — fully static, so compute once.
const YEARLY_SAVINGS_PCT = Math.round((1 - BUSINESS_SEAT_PRICE.yearly / 12 / BUSINESS_SEAT_PRICE.monthly) * 100)

interface TeamPlan {
    seats: number
    status: string
    currentPeriodEnd: Date | null
    cancelAtPeriodEnd: boolean
}

interface TeamManagementProps {
    currentUserId: string
    /** The active org's Business subscription, or null (server-resolved). */
    plan: TeamPlan | null
    /** Paid seats, or the free-team allowance when unsubscribed. */
    seatLimit: number
    /** Server-persisted "a member was removed, rotate the team key" marker. */
    keyRotationRecommended: boolean
    /** Org-wide 2FA enforcement policy. */
    enforce2FA: boolean
    /** Current shared-key generation (0 = not yet initialized). */
    keyGeneration: number
}

function initials(name?: string | null, email?: string | null): string {
    const source = name?.trim() || email?.trim() || ""
    if (!source) return "?"
    const parts = source.split(/\s+/).filter(Boolean)
    if (parts.length >= 2) return ((parts[0]?.[0] ?? "") + (parts[1]?.[0] ?? "")).toUpperCase()
    return source.slice(0, 2).toUpperCase()
}

export function TeamManagement({ currentUserId, plan, seatLimit, keyRotationRecommended, enforce2FA, keyGeneration }: TeamManagementProps) {
    const router = useRouter()
    const vault = useOptionalVault()
    const { data: hookOrg, isPending } = authClient.useActiveOrganization()
    // After a mutation we refetch explicitly and override the hook's cached value.
    const [override, setOverride] = useState<typeof hookOrg | null>(null)
    const [email, setEmail] = useState("")
    const [role, setRole] = useState<Role>("member")
    const [busy, setBusy] = useState(false)
    const [billing, setBilling] = useState(false)
    const [frequency, setFrequency] = useState<"monthly" | "yearly">("yearly")
    // Owner-chosen seats to purchase (default 2 so they can invite one teammate).
    const [seatCount, setSeatCount] = useState(2)
    const [settingsOpen, setSettingsOpen] = useState(false)
    const [rotating, setRotating] = useState(false)
    // Local echo of the server's keyRotationRecommended marker so the banner can
    // disappear immediately after a successful rotation (before refresh lands).
    const [rotationDone, setRotationDone] = useState(false)
    const showRotateBanner = keyRotationRecommended && !rotationDone

    // Drop a stale override when the active org itself changes (e.g. the user
    // switches teams or to Personal via the header while on this page).
    if (override && override.id !== hookOrg?.id) {
        setOverride(null)
    }

    const org = override ?? hookOrg

    // Bootstrap the team's shared E2EE on load: seed the org vault key if needed
    // (owner/admin, unseeded org) and grant it to any members awaiting access.
    // Fire-and-forget + fail-open — never blocks the page.
    const orgId = org?.id
    const myRoleForBootstrap = (org?.members ?? []).find((m) => m.userId === currentUserId)?.role
    const canManageForBootstrap = myRoleForBootstrap === "owner" || myRoleForBootstrap === "admin"
    const vaultStatus = vault?.status
    // Hold the vault in a ref so the bootstrap effect depends only on stable
    // primitives (orgId/status/role) — depending on the whole `vault` context
    // object re-ran the effect on most renders, causing an N-grant POST storm.
    const vaultRef = useRef(vault)
    useEffect(() => { vaultRef.current = vault })
    const bootstrappedRef = useRef<string | null>(null)
    useEffect(() => {
        if (!orgId || vaultStatus !== "unlocked") return
        // Run once per org per unlock (guards StrictMode double-invoke + re-mounts).
        const runKey = `${orgId}:${vaultStatus}`
        if (bootstrappedRef.current === runKey) return
        const vaultKey = vaultRef.current?.getVaultKey() ?? null
        if (!vaultKey) return
        bootstrappedRef.current = runKey
        let cancelled = false
        void bootstrapOrgVault({ orgId, vaultKey, canManage: canManageForBootstrap })
            .then((res) => {
                if (!cancelled && res.grantedCount > 0) {
                    toast.success(`Shared the team key with ${res.grantedCount} member${res.grantedCount === 1 ? "" : "s"}`)
                }
            })
            .catch(() => {
                // Allow a retry on the next dependency change if it failed.
                if (bootstrappedRef.current === runKey) bootstrappedRef.current = null
            })
        return () => { cancelled = true }
    }, [orgId, vaultStatus, canManageForBootstrap])

    const refresh = async () => {
        const { data } = await authClient.organization.getFullOrganization()
        if (data) setOverride(data)
        router.refresh()
    }

    const subscribe = async () => {
        setBilling(true)
        try {
            const res = await createTeamCheckoutSession({ frequency, seats: seatCount })
            if (res?.error) toast.error(res.error)
        } finally {
            setBilling(false)
        }
    }

    const manageBilling = async () => {
        setBilling(true)
        try {
            const res = await createOrgPortalSession()
            // Success redirects; only an error returns here.
            if (res?.error) toast.error(res.error)
        } finally {
            setBilling(false)
        }
    }

    const changeSeats = async (seats: number) => {
        setBilling(true)
        try {
            const res = await updateOrgSeats({ seats })
            if (res?.error) {
                toast.error(res.error)
            } else {
                toast.success(`Seats updated to ${seats}`)
                router.refresh()
            }
        } finally {
            setBilling(false)
        }
    }

    if (isPending && !org) {
        return <TeamManagementSkeleton />
    }

    if (!org) {
        return (
            <EmptyState
                icon={Building2}
                title="No team selected"
                description="Create or switch to a team using the switcher in the header to manage members, plan, and settings."
            />
        )
    }

    const members = org.members ?? []
    const invitations = (org.invitations ?? []).filter((i) => i.status === "pending")
    const myRole = members.find((m) => m.userId === currentUserId)?.role as Role | undefined
    const canManage = myRole === "owner" || myRole === "admin"
    const isOwner = myRole === "owner"
    const seatsUsed = members.length
    const seatsFull = seatsUsed >= seatLimit

    // Per-seat monthly-equivalent price for the upgrade card (depends on the toggle).
    const seatMonthly = (frequency === "yearly" ? BUSINESS_SEAT_PRICE.yearly / 12 : BUSINESS_SEAT_PRICE.monthly).toFixed(2)
    // Total for the chosen seat count, at the selected billing frequency.
    const seatTotal = (seatCount * (frequency === "yearly" ? BUSINESS_SEAT_PRICE.yearly : BUSINESS_SEAT_PRICE.monthly)).toFixed(2)

    const invite = async (e: React.FormEvent) => {
        e.preventDefault()
        if (!email.trim()) return
        setBusy(true)
        try {
            const { error } = await authClient.organization.inviteMember({ email: email.trim(), role })
            if (error) {
                toast.error(error.message || "Failed to send invitation")
                return
            }
            toast.success(`Invitation sent to ${email.trim()}`)
            setEmail("")
            await refresh()
        } finally {
            setBusy(false)
        }
    }

    const removeMember = async (memberId: string) => {
        const { error } = await authClient.organization.removeMember({ memberIdOrEmail: memberId })
        if (error) {
            toast.error(error.message || "Failed to remove member")
            return
        }
        toast.success("Member removed")
        setRotationDone(false)
        // The afterRemoveMember hook persists the "rotation recommended" marker
        // server-side; refresh re-reads it so the banner survives reloads.
        await refresh()
    }

    const rotateKeys = async () => {
        const vaultKey = vault?.getVaultKey() ?? null
        if (!vaultKey || !org) {
            toast.error("Unlock your vault to rotate the team key")
            return
        }
        setRotating(true)
        try {
            const res = await rotateOrgVaultKey(org.id, vaultKey)
            toast.success(`Team key rotated. Re-shared with ${res.members} member${res.members === 1 ? "" : "s"} and re-encrypted ${res.rekeyed} resource${res.rekeyed === 1 ? "" : "s"}.`)
            // Rotation cleared keyRotationRecommendedAt server-side; hide the
            // banner now and refresh so the server value re-syncs.
            setRotationDone(true)
            router.refresh()
        } catch (err) {
            toast.error(err instanceof Error ? err.message : "Failed to rotate team key")
        } finally {
            setRotating(false)
        }
    }

    const changeRole = async (memberId: string, newRole: Role) => {
        const { error } = await authClient.organization.updateMemberRole({ memberId, role: newRole })
        if (error) {
            toast.error(error.message || "Failed to update role")
            return
        }
        toast.success("Role updated")
        await refresh()
    }

    const cancelInvite = async (invitationId: string) => {
        const { error } = await authClient.organization.cancelInvitation({ invitationId })
        if (error) {
            toast.error(error.message || "Failed to cancel invitation")
            return
        }
        toast.success("Invitation canceled")
        await refresh()
    }

    return (
        <div className="flex flex-col gap-8">
            {/* ── Identity header ─────────────────────────────────────────── */}
            <div className="flex flex-col gap-6 border-b border-border/40 pb-8 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex items-center gap-4">
                    <div className="space-y-1">
                        <h2 className="font-serif text-3xl font-medium tracking-tight">{org.name}</h2>
                        <p className="text-sm font-light text-muted-foreground">
                            {seatsUsed} {seatsUsed === 1 ? "member" : "members"} ·{" "}
                            {plan ? "Business plan" : "Free team"} · {seatLimit}{" "}
                            {seatLimit === 1 ? "seat" : "seats"}
                        </p>
                    </div>
                </div>
                <div className="flex shrink-0 flex-wrap gap-2">
                    {canManage && (
                        <>
                            <Button variant="outline" size="sm" asChild>
                                <Link href="/dashboard/team/audit">
                                    <ScrollText className="mr-2 h-4 w-4" /> Audit log
                                </Link>
                            </Button>
                            <Button variant="outline" size="sm" asChild>
                                <a href="/api/org/export">
                                    <Download className="mr-2 h-4 w-4" /> Export data
                                </a>
                            </Button>
                        </>
                    )}
                    <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)}>
                        <Settings2 className="mr-2 h-4 w-4" /> Settings
                    </Button>
                </div>
            </div>

            {/* Rotation-recommended notice after a member is removed (true revocation). */}
            {canManage && showRotateBanner && (
                <div className="flex flex-col gap-3 rounded-lg border border-amber-500/20 bg-amber-500/10 px-4 py-3 text-sm text-amber-700 dark:text-amber-400 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-2">
                        <KeyRound className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>
                            A member was removed. Rotate the team key to fully revoke their access to
                            existing shared Drops and Forms.
                        </span>
                    </div>
                    <Button variant="outline" size="sm" onClick={() => setSettingsOpen(true)} className="shrink-0">
                        Rotate now
                    </Button>
                </div>
            )}

            {/* ── Plan ────────────────────────────────────────────────────── */}
            {plan && (
                <Card>
                    <CardContent className="flex flex-col gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
                        <div className="flex items-start gap-3">
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                                <Sparkles className="h-5 w-5" />
                            </div>
                            <div className="space-y-1">
                                <div className="flex items-center gap-2">
                                    <p className="font-medium">Business plan</p>
                                    <Badge
                                        variant="outline"
                                        className="border-success/20 bg-success/10 text-success"
                                    >
                                        {plan.status === "trialing" ? "Trial" : "Active"}
                                    </Badge>
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    {seatsUsed} of {plan.seats} seats in use
                                    {plan.currentPeriodEnd &&
                                        ` · ${plan.cancelAtPeriodEnd ? "ends" : "renews"} ${formatDate(plan.currentPeriodEnd)}`}
                                </p>
                            </div>
                        </div>
                        {isOwner && (
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                                {/* Seat control: clamps to at least the current member
                                    count server-side (block over-subscription). */}
                                <div className="flex items-center gap-1 rounded-md border px-1">
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={billing || plan.seats <= Math.max(seatsUsed, 1)}
                                        onClick={() => changeSeats(plan.seats - 1)}
                                        aria-label="Remove a seat"
                                    >
                                        <Minus className="h-3.5 w-3.5" />
                                    </Button>
                                    <span className="min-w-[2ch] text-center text-sm tabular-nums">{plan.seats}</span>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={billing}
                                        onClick={() => changeSeats(plan.seats + 1)}
                                        aria-label="Add a seat"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                                <Button variant="outline" size="sm" onClick={manageBilling} disabled={billing}>
                                    {billing ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <CreditCard className="mr-2 h-4 w-4" />}
                                    Manage billing
                                </Button>
                            </div>
                        )}
                    </CardContent>
                </Card>
            )}

            {/* ── Members ─────────────────────────────────────────────────── */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Members</CardTitle>
                    <CardDescription>
                        {seatsUsed} of {seatLimit} {seatLimit === 1 ? "seat" : "seats"} in use
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-1">
                    {canManage && (
                        <div className="space-y-2 border-b border-border/60 pb-5">
                            <form onSubmit={invite} className="flex flex-col gap-3 sm:flex-row">
                                <Input
                                    type="email"
                                    placeholder="teammate@company.com"
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    required
                                    disabled={seatsFull}
                                    className="flex-1"
                                />
                                <Select value={role} onValueChange={(v) => setRole(v as Role)}>
                                    <SelectTrigger className="sm:w-[140px]" disabled={seatsFull}>
                                        <SelectValue />
                                    </SelectTrigger>
                                    <SelectContent>
                                        <SelectItem value="member">Member</SelectItem>
                                        <SelectItem value="admin">Admin</SelectItem>
                                    </SelectContent>
                                </Select>
                                <Button type="submit" disabled={busy || seatsFull || !email.trim()}>
                                    {busy ? (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    ) : (
                                        <UserPlus className="mr-2 h-4 w-4" />
                                    )}
                                    Invite
                                </Button>
                            </form>
                            {seatsFull && (
                                <p className="text-xs text-muted-foreground">
                                    {plan
                                        ? `All ${seatLimit} seats are in use. Add seats from billing to invite more members.`
                                        : isOwner
                                          ? "Subscribe to Business and buy seats below to invite teammates."
                                          : "Ask the team owner to subscribe and add seats."}
                                </p>
                            )}
                        </div>
                    )}

                    <div className="divide-y divide-border/60">
                        {members.map((m) => {
                            const isSelf = m.userId === currentUserId
                            const editable = canManage && !isSelf && m.role !== "owner"
                            return (
                                <div key={m.id} className="flex items-center justify-between gap-3 py-3">
                                    <div className="flex min-w-0 items-center gap-3">
                                        <Avatar className="h-9 w-9">
                                            <AvatarImage src={m.user?.image || ""} alt={m.user?.name || ""} referrerPolicy="no-referrer" />
                                            <AvatarFallback className="text-xs font-medium">{initials(m.user?.name, m.user?.email)}</AvatarFallback>
                                        </Avatar>
                                        <div className="min-w-0">
                                            <p className="truncate text-sm font-medium">
                                                {m.user?.name || m.user?.email || "Member"}
                                                {isSelf && <span className="font-normal text-muted-foreground"> (you)</span>}
                                            </p>
                                            <p className="truncate text-xs text-muted-foreground">{m.user?.email}</p>
                                        </div>
                                    </div>
                                    <div className="flex shrink-0 items-center gap-2">
                                        {editable ? (
                                            <Select value={m.role} onValueChange={(v) => changeRole(m.id, v as Role)}>
                                                <SelectTrigger className="h-8 w-[110px] text-xs">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="member">Member</SelectItem>
                                                    <SelectItem value="admin">Admin</SelectItem>
                                                </SelectContent>
                                            </Select>
                                        ) : (
                                            <Badge variant="secondary" className="capitalize">{m.role}</Badge>
                                        )}
                                        {editable && (
                                            <ConfirmAction
                                                title="Remove member?"
                                                description={`${m.user?.name || m.user?.email || "This member"} will lose access to the team and its shared resources.`}
                                                confirmLabel="Remove"
                                                onConfirm={() => removeMember(m.id)}
                                                ariaLabel="Remove member"
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </ConfirmAction>
                                        )}
                                    </div>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>

            {/* ── Pending invitations ─────────────────────────────────────── */}
            {canManage && invitations.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle className="text-base">Pending invitations</CardTitle>
                        <CardDescription>
                            {invitations.length} awaiting a response
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="divide-y divide-border/60">
                        {invitations.map((inv) => (
                            <div key={inv.id} className="flex items-center justify-between gap-3 py-3">
                                <div className="flex min-w-0 items-center gap-3">
                                    <Avatar className="h-9 w-9">
                                        <AvatarFallback className="text-xs font-medium text-muted-foreground">
                                            {initials(null, inv.email)}
                                        </AvatarFallback>
                                    </Avatar>
                                    <div className="min-w-0">
                                        <p className="truncate text-sm">{inv.email}</p>
                                        <p className="text-xs capitalize text-muted-foreground">{inv.role} · Pending</p>
                                    </div>
                                </div>
                                <ConfirmAction
                                    title="Cancel invitation?"
                                    description={`The invitation to ${inv.email} will be revoked. They won't be able to join with it.`}
                                    confirmLabel="Cancel invitation"
                                    onConfirm={() => cancelInvite(inv.id)}
                                    ariaLabel="Cancel invitation"
                                >
                                    <X className="h-4 w-4" />
                                </ConfirmAction>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* ── Plans (shown below the team until it subscribes) ─────────── */}
            {!plan && isOwner && (
                <div className="grid items-start gap-6 md:grid-cols-2">
                    {/* Business — self-serve, per seat */}
                    <div className="relative flex flex-col gap-6 overflow-hidden rounded-[2rem] border border-primary/20 bg-card p-8">
                        <CardRibbon label="Teams" />
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Users className="h-5 w-5 text-primary" />
                                <h3 className="font-serif text-xl font-medium">Upgrade to {BUSINESS_PLAN.name}</h3>
                            </div>

                            {/* Billing-frequency toggle */}
                            <div className="inline-flex rounded-full border p-0.5 text-xs">
                                <button
                                    type="button"
                                    onClick={() => setFrequency("monthly")}
                                    aria-pressed={frequency === "monthly"}
                                    className={cn(
                                        "rounded-full px-3 py-1 transition-colors",
                                        frequency === "monthly"
                                            ? "bg-primary font-medium text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    Monthly
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFrequency("yearly")}
                                    aria-pressed={frequency === "yearly"}
                                    className={cn(
                                        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 transition-colors",
                                        frequency === "yearly"
                                            ? "bg-primary font-medium text-primary-foreground"
                                            : "text-muted-foreground hover:text-foreground",
                                    )}
                                >
                                    Yearly
                                    <span
                                        className={cn(
                                            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                                            frequency === "yearly" ? "bg-primary-foreground/20" : "bg-primary/10 text-primary",
                                        )}
                                    >
                                        Save {YEARLY_SAVINGS_PCT}%
                                    </span>
                                </button>
                            </div>

                            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                                <div className="flex items-baseline gap-1">
                                    <span className="font-serif text-4xl font-normal">${seatMonthly}</span>
                                    <span className="text-sm font-light text-muted-foreground">/seat/mo</span>
                                </div>
                                {frequency === "yearly" && (
                                    <span className="mt-3 rounded-full bg-secondary/70 px-3 py-1 text-xs font-medium text-muted-foreground">
                                        Billed ${BUSINESS_SEAT_PRICE.yearly}/seat/year
                                    </span>
                                )}
                            </div>

                            <p className="text-sm font-light text-muted-foreground">{BUSINESS_PLAN.description}</p>

                            {/* Seat count — purchase first, then invite up to this many members. */}
                            <div className="flex items-center justify-between gap-3 rounded-lg border bg-secondary/30 px-3 py-2.5">
                                <div className="space-y-0.5">
                                    <p className="text-sm font-medium">Seats</p>
                                    <p className="text-xs text-muted-foreground">Invite up to {seatCount} {seatCount === 1 ? "member" : "members"} (you included)</p>
                                </div>
                                <div className="flex items-center gap-1 rounded-md border bg-background px-1">
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={seatCount <= 1}
                                        onClick={() => setSeatCount((s) => Math.max(1, s - 1))}
                                        aria-label="Remove a seat"
                                    >
                                        <Minus className="h-3.5 w-3.5" />
                                    </Button>
                                    <span className="min-w-[2ch] text-center text-sm tabular-nums">{seatCount}</span>
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        className="h-7 w-7"
                                        disabled={seatCount >= 10000}
                                        onClick={() => setSeatCount((s) => Math.min(10000, s + 1))}
                                        aria-label="Add a seat"
                                    >
                                        <Plus className="h-3.5 w-3.5" />
                                    </Button>
                                </div>
                            </div>
                            <p className="text-sm text-muted-foreground">
                                <span className="font-medium text-foreground">${seatTotal}</span>{" "}
                                {frequency === "yearly" ? "billed yearly" : "per month"} for {seatCount}{" "}
                                {seatCount === 1 ? "seat" : "seats"}
                            </p>
                            <div className="my-2 h-px w-full bg-primary/10" />
                        </div>

                        <Button
                            onClick={subscribe}
                            disabled={billing}
                            className="h-10 w-full rounded-full bg-primary text-sm font-medium text-primary-foreground shadow-md shadow-primary/10 hover:bg-primary/90"
                        >
                            {billing ? (
                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            ) : (
                                <CreditCard className="mr-2 h-4 w-4" />
                            )}
                            Subscribe
                        </Button>

                        <ul className="space-y-3 text-sm text-muted-foreground">
                            {BUSINESS_PLAN.features.map((feature) => (
                                <FeatureItem key={feature} included text={feature} />
                            ))}
                        </ul>
                    </div>
                    {/* Enterprise — sales-led */}
                    <div className="flex flex-col gap-6 overflow-hidden rounded-[2rem] bg-secondary p-8">
                        <div className="space-y-4">
                            <div className="flex items-center gap-2">
                                <Building2 className="h-5 w-5" />
                                <h3 className="font-serif text-xl font-medium">{ENTERPRISE_PLAN.name}</h3>
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="font-serif text-4xl font-normal">Custom</span>
                            </div>
                            <p className="text-sm font-light text-muted-foreground">{ENTERPRISE_PLAN.description}</p>
                            <div className="my-2 h-px w-full bg-border/50" />
                        </div>
                        <Button asChild variant="outline" className="h-10 w-full rounded-full text-sm font-medium">
                            <a href="mailto:hi@anon.li?subject=anon.li%20Enterprise">Contact sales</a>
                        </Button>
                        <ul className="space-y-3 text-sm text-muted-foreground">
                            {ENTERPRISE_PLAN.features.map((feature) => (
                                <FeatureItem key={feature} included text={feature} />
                            ))}
                        </ul>
                    </div>
                </div>
            )}

            <TeamSettingsDialog
                open={settingsOpen}
                onOpenChange={setSettingsOpen}
                organizationId={org.id}
                name={org.name}
                slug={org.slug}
                canManage={canManage}
                isOwner={isOwner}
                hasActiveSubscription={Boolean(plan)}
                enforce2FA={enforce2FA}
                onRotateKeys={rotateKeys}
                rotating={rotating}
                keyRotationRecommended={showRotateBanner}
                vaultUnlocked={vault?.status === "unlocked"}
                keyGeneration={keyGeneration}
                onSaved={refresh}
            />
        </div>
    )
}

/** Icon button that confirms a destructive team action before running it. */
function ConfirmAction({
    title,
    description,
    confirmLabel,
    onConfirm,
    ariaLabel,
    children,
}: {
    title: string
    description: string
    confirmLabel: string
    onConfirm: () => void
    ariaLabel: string
    children: React.ReactNode
}) {
    return (
        <AlertDialog>
            <AlertDialogTrigger asChild>
                <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                    aria-label={ariaLabel}
                >
                    {children}
                </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
                <AlertDialogHeader>
                    <AlertDialogTitle>{title}</AlertDialogTitle>
                    <AlertDialogDescription>{description}</AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                    <AlertDialogCancel>Keep</AlertDialogCancel>
                    <AlertDialogAction
                        className={cn(buttonVariants({ variant: "destructive" }))}
                        onClick={onConfirm}
                    >
                        {confirmLabel}
                    </AlertDialogAction>
                </AlertDialogFooter>
            </AlertDialogContent>
        </AlertDialog>
    )
}

function TeamManagementSkeleton() {
    return (
        <div className="flex flex-col gap-8">
            <div className="flex items-center justify-between border-b border-border/40 pb-8">
                <div className="flex items-center gap-4">
                    <Skeleton className="h-14 w-14 rounded-2xl" />
                    <div className="space-y-2">
                        <Skeleton className="h-8 w-48" />
                        <Skeleton className="h-4 w-64" />
                    </div>
                </div>
                <Skeleton className="h-9 w-40" />
            </div>
            <Skeleton className="h-24 w-full rounded-xl" />
            <div className="space-y-3 rounded-xl border p-6">
                <Skeleton className="h-5 w-32" />
                <Skeleton className="h-10 w-full" />
                {[0, 1, 2].map((i) => (
                    <div key={i} className="flex items-center justify-between py-2">
                        <div className="flex items-center gap-3">
                            <Skeleton className="h-9 w-9 rounded-full" />
                            <div className="space-y-2">
                                <Skeleton className="h-4 w-40" />
                                <Skeleton className="h-3 w-52" />
                            </div>
                        </div>
                        <Skeleton className="h-8 w-24" />
                    </div>
                ))}
            </div>
        </div>
    )
}
