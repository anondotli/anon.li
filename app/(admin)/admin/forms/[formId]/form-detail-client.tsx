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
import { ArrowLeft, Ban, Inbox, Calendar, User, RotateCcw } from "lucide-react"
import { formatDateTime, formatDate } from "@/lib/admin/format"
import { takedownForm, restoreForm } from "@/actions/admin"
import { toast } from "sonner"

interface FormDetailClientProps {
    form: {
        id: string
        title: string
        description: string | null
        schemaJson: string
        publicKey: string
        active: boolean
        disabledByUser: boolean
        customKey: boolean
        salt: string | null
        allowFileUploads: boolean
        maxFileSizeOverride: string | null
        maxSubmissions: number | null
        closesAt: Date | null
        hideBranding: boolean
        notifyAliasId: string | null
        notifyEmailFallback: boolean
        submissionsCount: number
        takenDown: boolean
        takedownReason: string | null
        takenDownAt: Date | null
        deletedAt: Date | null
        createdAt: Date
        updatedAt: Date
        user: { id: string; email: string; name: string | null; tosViolations: number }
        ownerKey: { id: string; vaultGeneration: number; createdAt: Date; updatedAt: Date } | null
        _count: { submissions: number }
    }
}

export function FormDetailClient({ form }: FormDetailClientProps) {
    const router = useRouter()
    const [loading, setLoading] = useState(false)
    const [showTakedownDialog, setShowTakedownDialog] = useState(false)
    const [showRestoreDialog, setShowRestoreDialog] = useState(false)
    const [takedownReason, setTakedownReason] = useState("")

    const handleTakedown = async () => {
        if (!takedownReason.trim()) return

        setLoading(true)
        try {
            const result = await takedownForm(form.id, takedownReason)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Form taken down successfully")
                router.refresh()
                setShowTakedownDialog(false)
            }
        } catch {
            toast.error("Failed to takedown form")
        }
        setLoading(false)
    }

    const handleRestore = async () => {
        setLoading(true)
        try {
            const result = await restoreForm(form.id)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success("Form restored successfully")
                router.refresh()
                setShowRestoreDialog(false)
            }
        } catch {
            toast.error("Failed to restore form")
        }
        setLoading(false)
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/forms">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Forms
                    </Link>
                </Button>
            </div>

            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight">
                        {form.title || "(untitled)"}
                    </h1>
                    <p className="text-muted-foreground font-mono text-sm">
                        ID: {form.id}
                    </p>
                    <div className="flex gap-2 mt-2">
                        {form.takenDown ? (
                            <Badge variant="destructive">Taken Down</Badge>
                        ) : form.disabledByUser ? (
                            <Badge variant="outline">Disabled</Badge>
                        ) : (
                            <Badge variant="secondary">Active</Badge>
                        )}
                        {form.customKey && <Badge variant="outline">Password Protected</Badge>}
                        {form.allowFileUploads && <Badge variant="outline">File Uploads</Badge>}
                        {form.hideBranding && <Badge variant="outline">Branding Hidden</Badge>}
                        {form.ownerKey && <Badge variant="outline">Vault Key</Badge>}
                    </div>
                </div>

                <div className="flex gap-2">
                    {form.takenDown ? (
                        <Button
                            variant="outline"
                            onClick={() => setShowRestoreDialog(true)}
                            disabled={loading}
                        >
                            <RotateCcw className="h-4 w-4 mr-2" />
                            Restore
                        </Button>
                    ) : (
                        <Button
                            variant="outline"
                            onClick={() => setShowTakedownDialog(true)}
                            disabled={loading}
                        >
                            <Ban className="h-4 w-4 mr-2" />
                            Takedown
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Submissions</CardTitle>
                        <Inbox className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{form._count.submissions}</div>
                        {form.maxSubmissions && (
                            <p className="text-xs text-muted-foreground">
                                of {form.maxSubmissions} max
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Closes</CardTitle>
                        <Calendar className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {form.closesAt ? formatDate(form.closesAt) : "Never"}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">File Uploads</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {form.allowFileUploads ? "Yes" : "No"}
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Active</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {form.active && !form.disabledByUser && !form.takenDown ? "Yes" : "No"}
                        </div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <div>
                        <CardTitle>Owner</CardTitle>
                        <CardDescription>User who created this form</CardDescription>
                    </div>
                    <User className="h-4 w-4 text-muted-foreground" />
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div>
                            <p className="font-medium">{form.user.email}</p>
                            <p className="text-sm text-muted-foreground">
                                {form.user.name || "No name"} · {form.user.tosViolations} ToS violations
                            </p>
                        </div>
                        <Button variant="outline" size="sm" asChild>
                            <Link href={`/admin/users/${form.user.id}`}>
                                View User
                            </Link>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle>Form Content</CardTitle>
                    <CardDescription>
                        Title and schema are plaintext (public to anyone with the link). Submissions are E2E encrypted.
                    </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4">
                    <div>
                        <Label className="text-muted-foreground">Title</Label>
                        <p className="font-medium">{form.title || "(untitled)"}</p>
                    </div>
                    {form.description && (
                        <div>
                            <Label className="text-muted-foreground">Description</Label>
                            <p className="whitespace-pre-wrap">{form.description}</p>
                        </div>
                    )}
                    <div>
                        <Label className="text-muted-foreground">Schema (JSON)</Label>
                        <pre className="text-xs bg-muted rounded p-3 overflow-x-auto max-h-80">
                            {form.schemaJson}
                        </pre>
                    </div>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <CardTitle>Form Details</CardTitle>
                </CardHeader>
                <CardContent className="grid gap-4 md:grid-cols-2">
                    <div>
                        <Label className="text-muted-foreground">Created</Label>
                        <p>{formatDateTime(form.createdAt)}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Last Updated</Label>
                        <p>{formatDateTime(form.updatedAt)}</p>
                    </div>
                    {form.takenDownAt && (
                        <div>
                            <Label className="text-muted-foreground">Taken Down At</Label>
                            <p>{formatDateTime(form.takenDownAt)}</p>
                        </div>
                    )}
                    {form.takedownReason && (
                        <div className="md:col-span-2">
                            <Label className="text-muted-foreground">Takedown Reason</Label>
                            <p className="text-destructive">{form.takedownReason}</p>
                        </div>
                    )}
                    <div>
                        <Label className="text-muted-foreground">Vault Owner Key</Label>
                        <p>{form.ownerKey ? `Generation ${form.ownerKey.vaultGeneration}` : "Not stored"}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Submission Notifications</Label>
                        <p>{form.notifyEmailFallback || form.notifyAliasId ? "Account email" : "Off"}</p>
                    </div>
                    <div>
                        <Label className="text-muted-foreground">Public Key</Label>
                        <p className="font-mono text-xs break-all">{form.publicKey}</p>
                    </div>
                </CardContent>
            </Card>

            <AlertDialog open={showTakedownDialog} onOpenChange={setShowTakedownDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Takedown Form</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will disable the form and notify the owner. The owner will receive a ToS violation strike.
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
                            {loading ? "Processing..." : "Takedown Form"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            <AlertDialog open={showRestoreDialog} onOpenChange={setShowRestoreDialog}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Restore Form</AlertDialogTitle>
                        <AlertDialogDescription>
                            This will restore the form and decrement one ToS violation strike from the owner.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleRestore}
                            disabled={loading}
                        >
                            {loading ? "Processing..." : "Restore Form"}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    )
}
