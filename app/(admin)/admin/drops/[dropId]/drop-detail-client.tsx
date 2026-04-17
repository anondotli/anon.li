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
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import {
    ArrowLeft,
    Ban,
    Trash2,
    Download,
    Eye,
    File,
    Calendar,
    User
} from "lucide-react"
import { formatBytes, formatDateTime, formatDate } from "@/lib/admin/format"
import { takedownDrop, deleteDrop } from "@/actions/admin"
import { toast } from "sonner"

interface DropDetailClientProps {
    drop: {
        id: string
        encryptedTitle: string | null
        encryptedMessage: string | null
        iv: string
        customKey: boolean
        expiresAt: Date | null
        maxDownloads: number | null
        downloads: number
        disabled: boolean
        disabledAt: Date | null
        takenDown: boolean
        takedownReason: string | null
        takenDownAt: Date | null
        uploadComplete: boolean
        viewedAt: Date | null
        deletedAt: Date | null
        createdAt: Date
        updatedAt: Date
        user: {
            id: string
            email: string
            name: string | null
            tosViolations: number
        } | null
        ownerKey: {
            id: string
            vaultGeneration: number
            createdAt: Date
            updatedAt: Date
        } | null
        files: Array<{
            id: string
            encryptedName: string
            size: string
            mimeType: string
            uploadComplete: boolean
            chunkCount: number | null
            chunkSize: number | null
            createdAt: Date
        }>
    }
}

export function DropDetailClient({ drop }: DropDetailClientProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [showTakedownDialog, setShowTakedownDialog] = useState(false)
    const [showDeleteDialog, setShowDeleteDialog] = useState(false)
    const [takedownReason, setTakedownReason] = useState("")

    const totalSize = drop.files.reduce((sum, f) => sum + parseInt(f.size, 10), 0)

    const handleTakedown = async () => {
        if (!takedownReason.trim()) return

        setLoading(true)
        try {
            const result = await takedownDrop(drop.id, takedownReason)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Drop taken down successfully")
                router.refresh()
                setShowTakedownDialog(false)
            }
        } catch {
            toast.error("Failed to takedown drop")
        }
        setLoading(false)
    }

    const handleDelete = async () => {
        setLoading(true)
        try {
            const result = await deleteDrop(drop.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Drop deleted successfully")
                router.push("/admin/drops")
            }
        } catch {
            toast.error("Failed to delete drop")
        }
        setLoading(false)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/drops">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Drops
                    </Link>
                </Button>
            </div>

            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight font-mono">
                        {drop.id.slice(0, 16)}...
                    </h1>
                    <p className="text-muted-foreground">
                        Full ID: {drop.id}
                    </p>
                    <div className="flex gap-2 mt-2">
                        {drop.takenDown ? (
                            <Badge variant="destructive">Taken Down</Badge>
                        ) : drop.disabled ? (
                            <Badge variant="outline">Disabled</Badge>
                        ) : (
                            <Badge variant="secondary">Active</Badge>
                        )}
                        {!drop.uploadComplete && <Badge variant="outline">Upload Incomplete</Badge>}
                        {drop.customKey && <Badge variant="outline">Password Protected</Badge>}
                        {drop.ownerKey && <Badge variant="outline">Owner Vault Key</Badge>}
                        {drop.user === null && <Badge variant="outline">Anonymous</Badge>}
                    </div>
                </div>

                <div className="flex gap-2">
                    {!drop.takenDown && (
                        <Button
                            variant="outline"
                            onClick={() => setShowTakedownDialog(true)}
                            disabled={loading}
                        >
                            <Ban className="h-4 w-4 mr-2" />
                            Takedown
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
                        <CardTitle className="text-sm font-medium">Files</CardTitle>
                        <File className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{drop.files.length}</div>
                        <p className="text-xs text-muted-foreground">
                            {formatBytes(totalSize)} total
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Downloads</CardTitle>
                        <Download className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{drop.downloads}</div>
                        {drop.maxDownloads && (
                            <p className="text-xs text-muted-foreground">
                                of {drop.maxDownloads} max
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Viewed</CardTitle>
                        <Eye className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {drop.viewedAt ? "Yes" : "No"}
                        </div>
                        {drop.viewedAt && (
                            <p className="text-xs text-muted-foreground">
                                {formatDate(drop.viewedAt)}
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Expires</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {drop.expiresAt ? formatDate(drop.expiresAt) : "Never"}
                        </div>
                    </CardContent>
                </Card>
            </div>

            {drop.user && (
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between">
                        <div>
                            <CardTitle>Owner</CardTitle>
                            <CardDescription>User who created this drop</CardDescription>
                        </div>
                        <User className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="flex items-center justify-between">
                            <div>
                                <p className="font-medium">{drop.user.email}</p>
                                <p className="text-sm text-muted-foreground">
                                    {drop.user.name || "No name"} · {drop.user.tosViolations} ToS violations
                                </p>
                            </div>
                            <Button variant="outline" size="sm" asChild>
                                <Link href={`/admin/users/${drop.user.id}`}>
                                    View User
                                </Link>
                            </Button>
                        </div>
                    </CardContent>
                </Card>
            )}

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle>Files</CardTitle>
                    <CardDescription>
                        Files in this drop (content is E2E encrypted - only metadata visible)
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>File ID</TableHead>
                                <TableHead>MIME Type</TableHead>
                                <TableHead>Size</TableHead>
                                <TableHead>Status</TableHead>
                                <TableHead>Created</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {drop.files.map((file) => (
                                <TableRow key={file.id}>
                                    <TableCell>
                                        <code className="text-sm">{file.id.slice(0, 12)}...</code>
                                    </TableCell>
                                    <TableCell>{file.mimeType}</TableCell>
                                    <TableCell>{formatBytes(file.size)}</TableCell>
                                    <TableCell>
                                        <Badge variant={file.uploadComplete ? "secondary" : "outline"}>
                                            {file.uploadComplete ? "Complete" : "Incomplete"}
                                        </Badge>
                                    </TableCell>
                                    <TableCell>
                                        {formatDate(file.createdAt)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Drop Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div>
                        <Label className="text-muted-foreground">Created</Label>
                        <p>{formatDateTime(drop.createdAt)}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Last Updated</Label>
                        <p>{formatDateTime(drop.updatedAt)}</p>
                    </div>
                    {drop.disabledAt && (
                        <div>
                            <Label className="text-muted-foreground">Disabled At</Label>
                            <p>{formatDateTime(drop.disabledAt)}</p>
                        </div>
                    )}
                    {drop.takenDownAt && (
                        <div>
                            <Label className="text-muted-foreground">Taken Down At</Label>
                            <p>{formatDateTime(drop.takenDownAt)}</p>
                        </div>
                    )}
                    {drop.takedownReason && (
                        <div className="md:col-span-2">
                            <Label className="text-muted-foreground">Takedown Reason</Label>
                            <p className="text-destructive">{drop.takedownReason}</p>
                        </div>
                    )}
                    <div>
                        <Label className="text-muted-foreground">Vault Owner Key</Label>
                        <p>{drop.ownerKey ? `Generation ${drop.ownerKey.vaultGeneration}` : "Not stored"}</p>
                    </div>
                </CardContent>
            </Card>

            {/* Takedown Dialog */}
            <AlertDialog open={showTakedownDialog} onOpenChange={setShowTakedownDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Takedown Drop</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will disable the drop and notify the owner (if any). The owner will receive a ToS violation strike.
                        </AlertDialogDescription>
                    </AlertDialogHeader>

                    <div className="space-y-4 py-4">
                        <div className="space-y-2">
                            <Label htmlFor="reason">Takedown Reason</Label>
                            <Textarea
                                id="reason"
                                placeholder="Enter the reason for takedown (e.g., 'Violation of ToS section X')"
                                value={takedownReason}
                                onChange={(e) => setTakedownReason(e.target.value)}
                            />
                        </div>
                    </div>

                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleTakedown}
                            disabled={loading || !takedownReason.trim()}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {loading ? "Processing..." : "Takedown Drop"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Delete Dialog */}
            <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Drop</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete the drop and all its files from the database. Storage cleanup will be handled by a background job. This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDelete}
                            disabled={loading}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {loading ? "Deleting..." : "Delete Drop"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
