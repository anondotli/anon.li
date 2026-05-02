"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Separator } from "@/components/ui/separator"
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import {
    ArrowLeft,
    Ban,
    CheckCircle,
    Trash2,
    Mail,
    FileBox,
    Shield,
    CreditCard
} from "lucide-react"
import { formatBytes, formatDateTime } from "@/lib/admin/format"
import { banUser, unbanUser, deleteUser } from "@/actions/admin"
import { toast } from "sonner"

interface UserDetailClientProps {
    user: {
        id: string
        email: string
        name: string | null
        isAdmin: boolean
        banned: boolean
        banReason: string | null
        banAliasCreation: boolean
        banFileUpload: boolean
        tosViolations: number
        emailVerified: boolean
        twoFactorEnabled: boolean
        paymentMethod: string
        downgradedAt: Date | null
        storageUsed: string
        storageLimit: string
        createdAt: Date
        updatedAt: Date
        primarySubscription: {
            provider: string
            product: string
            tier: string
            status: string
            currentPeriodEnd: Date | null
            cancelAtPeriodEnd: boolean
            providerSubscriptionId: string | null
        } | null
        subscriptions: Array<{
            id: string
            provider: string
            providerSubscriptionId: string | null
            providerCustomerId: string | null
            providerPriceId: string | null
            product: string
            tier: string
            status: string
            currentPeriodStart: Date | null
            currentPeriodEnd: Date | null
            cancelAtPeriodEnd: boolean
            createdAt: Date
        }>
        cryptoPayments: Array<{
            id: string
            nowPaymentId: string
            invoiceId: string | null
            orderId: string
            payAmount: number
            payCurrency: string
            priceAmount: number
            priceCurrency: string
            actuallyPaid: number | null
            product: string
            tier: string
            status: string
            periodStart: Date | null
            periodEnd: Date | null
            createdAt: Date
        }>
        deletionRequest: {
            id: string
            status: string
            sessionsDeleted: boolean
            aliasesDeleted: boolean
            domainsDeleted: boolean
            dropsDeleted: boolean
            storageDeleted: boolean
            requestedAt: Date
            completedAt: Date | null
        } | null
        security: {
            migrationState: string
            vaultGeneration: number
            passwordSetAt: Date
            updatedAt: Date
        } | null
        twoFactor: { verified: boolean } | null
        aliases: Array<{
            id: string
            email: string
            active: boolean
            emailsReceived: number
            scheduledForRemovalAt: Date | null
            createdAt: Date
        }>
        drops: Array<{
            id: string
            uploadComplete: boolean
            takenDown: boolean
            disabled: boolean
            downloads: number
            createdAt: Date
            totalSize: number
        }>
        _count: {
            aliases: number
            drops: number
            recipients: number
            domains: number
            apiKeys: number
            sessions: number
        }
    }
}

export function UserDetailClient({ user }: UserDetailClientProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [showBanDialog, setShowBanDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [banType, setBanType] = useState<"full" | "alias" | "upload">("full")
    const [banReason, setBanReason] = useState("")

    const handleBan = async () => {
        setLoading(true)
        try {
            const result = await banUser(user.id, {
                full: banType === "full",
                aliasCreation: banType === "alias",
                fileUpload: banType === "upload",
                reason: banReason
            })
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("User banned successfully")
                router.refresh()
                setShowBanDialog(false)
            }
        } catch {
            toast.error("Failed to ban user")
        }
        setLoading(false)
    }

    const handleUnban = async () => {
        setLoading(true)
        try {
            const result = await unbanUser(user.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("User unbanned successfully")
                router.refresh()
            }
        } catch {
            toast.error("Failed to unban user")
        }
        setLoading(false)
    }

    const handleDelete = async () => {
        setLoading(true)
        try {
            const result = await deleteUser(user.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Account deleted")
                router.refresh()
                setShowDeleteDialog(false)
            }
        } catch {
            toast.error("Failed to delete account")
        }
        setLoading(false)
    }

    const isBanned = user.banned || user.banAliasCreation || user.banFileUpload
    const planLabel = user.primarySubscription
        ? `${user.primarySubscription.product.charAt(0).toUpperCase() + user.primarySubscription.product.slice(1)} ${user.primarySubscription.tier.charAt(0).toUpperCase() + user.primarySubscription.tier.slice(1)}`
        : "Free"

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/users">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Users
                    </Link>
                </Button>
            </div>

            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">{user.email}</h1>
                    <p className="text-muted-foreground">
                        {user.name || "No name"} · ID: {user.id}
                    </p>
                    <div className="flex gap-2 mt-2">
                        {user.isAdmin && <Badge>Admin</Badge>}
                        {user.emailVerified && <Badge variant="outline">Email verified</Badge>}
                        {user.twoFactorEnabled && <Badge variant="outline">2FA enabled</Badge>}
                        {user.banned && <Badge variant="destructive">Banned</Badge>}
                        {user.banAliasCreation && <Badge variant="outline" className="text-orange-500">Alias Ban</Badge>}
                        {user.banFileUpload && <Badge variant="outline" className="text-orange-500">Upload Ban</Badge>}
                        {user.deletionRequest && <Badge variant="destructive">Deletion {user.deletionRequest.status}</Badge>}
                        {user.tosViolations > 0 && (
                            <Badge variant="outline" className="text-orange-500">
                                {user.tosViolations} strike{user.tosViolations !== 1 ? "s" : ""}
                            </Badge>
                        )}
                    </div>
                </div>

                <div className="flex gap-2">
                    {isBanned ? (
                        <Button
                            variant="outline"
                            onClick={handleUnban}
                            disabled={loading}
                        >
                            <CheckCircle className="h-4 w-4 mr-2" />
                            {loading ? "Processing..." : "Unban"}
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => setShowBanDialog(true)}
                            disabled={loading}
                        >
                            <Ban className="h-4 w-4 mr-2" />
                            Ban
                        </Button>
                    )}
                    <Button
                        variant="destructive"
                        onClick={() => setShowDeleteDialog(true)}
                        disabled={loading || !!user.deletionRequest}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        {user.deletionRequest ? "Deletion Pending" : "Delete"}
                    </Button>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Aliases</CardTitle>
                        <Mail className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{user._count.aliases}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Drops</CardTitle>
                        <FileBox className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{user._count.drops}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Storage</CardTitle>
                        <Shield className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{formatBytes(user.storageUsed)}</div>
                        <p className="text-xs text-muted-foreground">
                            of {formatBytes(user.storageLimit)}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Plan</CardTitle>
                        <CreditCard className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {planLabel}
                        </div>
                        <p className="text-xs text-muted-foreground capitalize">
                            {user.primarySubscription?.provider ?? user.paymentMethod}
                            {user.primarySubscription?.status ? ` · ${user.primarySubscription.status}` : ""}
                        </p>
                        {user.subscriptions[0]?.providerCustomerId && (
                            <p className="text-xs text-muted-foreground truncate">
                                {user.subscriptions[0].providerCustomerId}
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Separator />

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Aliases</CardTitle>
                        <CardDescription>Last 10 created aliases</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {user.aliases.length > 0 ? (
                            <div className="space-y-2">
                                {user.aliases.map((alias) => (
                                    <div key={alias.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                        <div>
                                            <div className="font-mono text-sm">{alias.email}</div>
                                            <div className="text-xs text-muted-foreground">
                                                {alias.emailsReceived} emails
                                            </div>
                                        </div>
                                        <Badge variant={alias.active ? "secondary" : "outline"}>
                                            {alias.active ? "Active" : "Inactive"}
                                        </Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm">No aliases created</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Recent Drops</CardTitle>
                        <CardDescription>Last 10 created drops</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {user.drops.length > 0 ? (
                            <div className="space-y-2">
                                {user.drops.map((drop) => (
                                    <div key={drop.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                        <div>
                                            <Link
                                                href={`/admin/drops/${drop.id}`}
                                                className="font-mono text-sm hover:underline"
                                            >
                                                {drop.id.slice(0, 12)}...
                                            </Link>
                                            <div className="text-xs text-muted-foreground">
                                                {formatBytes(drop.totalSize)} · {drop.downloads} downloads
                                            </div>
                                        </div>
                                        <div className="flex gap-1">
                                            {drop.takenDown && <Badge variant="destructive">Taken Down</Badge>}
                                            {drop.disabled && !drop.takenDown && <Badge variant="outline">Disabled</Badge>}
                                            {!drop.uploadComplete && <Badge variant="outline">Incomplete</Badge>}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm">No drops created</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Account Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div>
                        <Label className="text-muted-foreground">Created</Label>
                        <p>{formatDateTime(user.createdAt)}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Last Updated</Label>
                        <p>{formatDateTime(user.updatedAt)}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Recipients</Label>
                        <p>{user._count.recipients}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Custom Domains</Label>
                        <p>{user._count.domains}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">API Keys</Label>
                        <p>{user._count.apiKeys}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Active Sessions</Label>
                        <p>{user._count.sessions}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Payment Method</Label>
                        <p className="capitalize">{user.paymentMethod}</p>
                    </div>
                    {user.downgradedAt && (
                        <div>
                            <Label className="text-muted-foreground">Downgraded</Label>
                            <p>{formatDateTime(user.downgradedAt)}</p>
                        </div>
                    )}
                    {user.banReason && (
                        <div className="md:col-span-2">
                            <Label className="text-muted-foreground">Ban Reason</Label>
                            <p className="text-destructive">{user.banReason}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Subscriptions</CardTitle>
                        <CardDescription>Canonical Subscription records.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {user.subscriptions.length > 0 ? (
                            <div className="space-y-3">
                                {user.subscriptions.map((subscription) => (
                                    <div key={subscription.id} className="rounded border p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="font-medium capitalize">
                                                {subscription.product} {subscription.tier}
                                            </div>
                                            <Badge variant={subscription.status === "active" || subscription.status === "trialing" ? "default" : "outline"}>
                                                {subscription.status}
                                            </Badge>
                                        </div>
                                        <div className="mt-1 text-xs text-muted-foreground">
                                            {subscription.provider}
                                            {subscription.currentPeriodEnd ? ` · ends ${formatDateTime(subscription.currentPeriodEnd)}` : " · no period end"}
                                            {subscription.cancelAtPeriodEnd ? " · canceling" : ""}
                                        </div>
                                        {subscription.providerSubscriptionId && (
                                            <code className="mt-2 block text-xs text-muted-foreground truncate">
                                                {subscription.providerSubscriptionId}
                                            </code>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No canonical subscription records.</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Security & Deletion</CardTitle>
                        <CardDescription>Operational state for vault, 2FA, and account deletion.</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div>
                            <Label className="text-muted-foreground">Vault</Label>
                            {user.security ? (
                                <p>
                                    <span className="capitalize">{user.security.migrationState}</span>
                                    <span className="text-muted-foreground"> · generation {user.security.vaultGeneration}</span>
                                </p>
                            ) : (
                                <p className="text-muted-foreground">Not configured</p>
                            )}
                        </div>
                        <div>
                            <Label className="text-muted-foreground">Two-factor</Label>
                            <p>{user.twoFactorEnabled ? (user.twoFactor?.verified ? "Enabled and verified" : "Enabled") : "Disabled"}</p>
                        </div>
                        {user.deletionRequest ? (
                            <div className="rounded border border-destructive/30 p-3">
                                <div className="flex items-center justify-between">
                                    <Label className="text-muted-foreground">Deletion Request</Label>
                                    <Badge variant="destructive">{user.deletionRequest.status}</Badge>
                                </div>
                                <p className="mt-1 text-sm">
                                    Requested {formatDateTime(user.deletionRequest.requestedAt)}
                                </p>
                                <p className="text-xs text-muted-foreground">
                                    Sessions {user.deletionRequest.sessionsDeleted ? "deleted" : "pending"} ·
                                    Aliases {user.deletionRequest.aliasesDeleted ? "deleted" : "pending"} ·
                                    Drops {user.deletionRequest.dropsDeleted ? "deleted" : "pending"} ·
                                    Storage {user.deletionRequest.storageDeleted ? "deleted" : "pending"}
                                </p>
                            </div>
                        ) : (
                            <div>
                                <Label className="text-muted-foreground">Deletion Request</Label>
                                <p className="text-muted-foreground">None</p>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {user.cryptoPayments.length > 0 && (
                <Card>
                    <CardHeader>
                        <CardTitle>Recent Crypto Payments</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        {user.cryptoPayments.map((payment) => (
                            <div key={payment.id} className="flex items-center justify-between gap-4 rounded border p-3">
                                <div>
                                    <div className="font-medium capitalize">
                                        {payment.product} {payment.tier}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                        {payment.payAmount} {payment.payCurrency.toUpperCase()} · {formatDateTime(payment.createdAt)}
                                    </div>
                                </div>
                                <Badge variant={payment.status === "finished" ? "default" : "outline"}>
                                    {payment.status}
                                </Badge>
                            </div>
                        ))}
                    </CardContent>
                </Card>
            )}

            {/* Ban Dialog */}
            <AlertDialog open={showBanDialog} onOpenChange={setShowBanDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Ban User</AlertDialogTitle>
                        <AlertDialogDescription>
                            Select ban options for {user.email}
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4 py-4">
                        <RadioGroup value={banType} onValueChange={(v) => setBanType(v as typeof banType)}>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="full" id="full" />
                                <Label htmlFor="full">Full account ban (blocks all access)</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="alias" id="alias" />
                                <Label htmlFor="alias">Block alias creation only</Label>
                            </div>
                            <div className="flex items-center space-x-2">
                                <RadioGroupItem value="upload" id="upload" />
                                <Label htmlFor="upload">Block file uploads only</Label>
                            </div>
                        </RadioGroup>

                        <div className="space-y-2">
                            <Label htmlFor="reason">Reason</Label>
                            <Textarea
                                id="reason"
                                placeholder="Enter ban reason..."
                                value={banReason}
                                onChange={(e) => setBanReason(e.target.value)}
                            />
                        </div>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleBan}
                            disabled={loading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {loading ? "Banning..." : "Ban User"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete User</AlertDialogTitle>
                        <AlertDialogDescription>
                            This immediately deletes {user.email}. Sessions are revoked, active-system data is erased, and the user row is hard-deleted if the deletion succeeds. Failed deletions remain in the retry queue.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={loading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {loading ? "Deleting..." : "Delete User"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
