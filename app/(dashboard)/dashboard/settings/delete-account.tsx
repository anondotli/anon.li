"use client"

import { Button } from "@/components/ui/button"
import { useState } from "react"
import { Loader2, Trash2, AlertTriangle, Mail, FileText, Globe, Settings } from "lucide-react"
import { toast } from "sonner"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogTrigger,
} from "@/components/ui/alert-dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { deleteAccountAction } from "@/actions/settings"

export function DeleteAccountSection() {
    const [loading, setLoading] = useState(false)
    const [open, setOpen] = useState(false)
    const [confirmText, setConfirmText] = useState("")

    const isConfirmed = confirmText === "DELETE"

    const handleDelete = async () => {
        if (!isConfirmed) return

        setLoading(true)
        try {
            const res = await deleteAccountAction()
            if (res?.error) {
                toast.error(res.error)
            } else {
                toast.success("Account deleted")
                window.location.href = "/"
            }
        } catch {
            toast.error("Failed to delete account")
        } finally {
            setLoading(false)
            setOpen(false)
        }
    }

    const handleOpenChange = (isOpen: boolean) => {
        setOpen(isOpen)
        if (!isOpen) {
            setConfirmText("")
        }
    }

    const deletedItems = [
        { icon: Mail, label: "All email aliases" },
        { icon: Globe, label: "Custom domains" },
        { icon: FileText, label: "Uploaded files" },
        { icon: Settings, label: "Account settings" },
    ]

    return (
        <Card className="rounded-3xl border-destructive/30 overflow-hidden">
            <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-destructive/10">
                            <Trash2 className="h-5 w-5 text-destructive" />
                        </div>
                        <div>
                            <CardTitle className="text-lg font-medium text-destructive">Danger Zone</CardTitle>
                            <CardDescription className="text-sm">
                                Permanently delete your account
                            </CardDescription>
                        </div>
                    </div>
                    <AlertDialog open={open} onOpenChange={handleOpenChange}>
                        <AlertDialogTrigger asChild>
                            <Button variant="destructive" size="sm">
                                <Trash2 className="h-4 w-4 mr-2" />
                                Delete
                            </Button>
                        </AlertDialogTrigger>
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle className="flex items-center gap-2">
                                    <AlertTriangle className="h-5 w-5 text-destructive" />
                                    Are you absolutely sure?
                                </AlertDialogTitle>
                                <AlertDialogDescription>
                                    This action cannot be undone. Your aliases, domains, files,
                                    drops, API keys, and recipients are deleted immediately. Your
                                    account record is permanently removed after 30 days.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <div className="space-y-2 py-4">
                                <Label htmlFor="confirm" className="text-sm font-medium">
                                    Type <span className="font-mono font-bold text-destructive">DELETE</span> to confirm
                                </Label>
                                <Input
                                    id="confirm"
                                    value={confirmText}
                                    onChange={(e) => setConfirmText(e.target.value)}
                                    placeholder="Type DELETE here"
                                    className="font-mono"
                                    autoComplete="off"
                                />
                            </div>
                            <AlertDialogFooter>
                                <AlertDialogCancel disabled={loading}>Cancel</AlertDialogCancel>
                                <Button
                                    onClick={handleDelete}
                                    variant="destructive"
                                    disabled={loading || !isConfirmed}
                                >
                                    {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                                    {loading ? "Deleting..." : "Delete Account"}
                                </Button>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </div>
            </CardHeader>
            <CardContent>
                <div className="rounded-xl bg-destructive/5 border border-destructive/20 p-4 space-y-3">
                    <div className="flex items-start gap-2">
                        <AlertTriangle className="h-4 w-4 text-destructive mt-0.5 shrink-0" />
                        <p className="text-sm text-muted-foreground">
                            Once you delete your account, there is no going back. This action is permanent and cannot be undone.
                        </p>
                    </div>
                    <div className="pt-2 border-t border-destructive/10">
                        <p className="text-xs font-medium text-muted-foreground mb-2">This will permanently delete:</p>
                        <div className="grid grid-cols-2 gap-1.5">
                            {deletedItems.map((item) => (
                                <div key={item.label} className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <item.icon className="h-3 w-3" />
                                    <span>{item.label}</span>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            </CardContent>
        </Card>
    )
}
