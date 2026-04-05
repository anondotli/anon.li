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
import { formatBytes, formatDateTime, getPlanName } from "@/lib/admin/format"
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
        stripePriceId: string | null
        stripeCustomerId: string | null
        storageUsed: string
        storageLimit: string
        createdAt: Date
        updatedAt: Date
        aliases: Array<{
            id: string
            email: string
            active: boolean
            emailsReceived: number
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
                toast.success("User deleted successfully")
                router.push("/admin/users")
            }
        } catch {
            toast.error("Failed to delete user")
        }
        setLoading(false)
    }

    const isBanned = user.banned || user.banAliasCreation || user.banFileUpload

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
                        {user.banned && <Badge variant="destructive">Banned</Badge>}
                        {user.banAliasCreation && <Badge variant="outline" className="text-orange-500">Alias Ban</Badge>}
                        {user.banFileUpload && <Badge variant="outline" className="text-orange-500">Upload Ban</Badge>}
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
                        disabled={loading}
                    >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
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
                            {getPlanName(user.stripePriceId)}
                        </div>
                        {user.stripeCustomerId && (
                            <p className="text-xs text-muted-foreground truncate">
                                {user.stripeCustomerId}
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
                    {user.banReason && (
                        <div className="md:col-span-2">
                            <Label className="text-muted-foreground">Ban Reason</Label>
                            <p className="text-destructive">{user.banReason}</p>
                        </div>
                    )}
                </CardContent>
            </Card>

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
                            This will permanently delete {user.email} and all their data including aliases, drops, and settings. This action cannot be undone.
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
