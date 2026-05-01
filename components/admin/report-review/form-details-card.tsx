"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, ClipboardList, Lock, Inbox, Loader2 } from "lucide-react"
import { formatDateTime } from "@/lib/admin/format"
import type { FormDetails } from "./types"

interface FormDetailsCardProps {
    resourceId: string
    form?: FormDetails | null
    loading: boolean
}

function getFormStatus(form: FormDetails): { label: string; variant: "default" | "secondary" | "destructive" | "outline" } {
    if (form.takenDown) return { label: "Taken Down", variant: "destructive" }
    if (form.disabledByUser) return { label: "Disabled", variant: "outline" }
    if (!form.active) return { label: "Inactive", variant: "outline" }
    return { label: "Active", variant: "secondary" }
}

export function FormDetailsCard({ resourceId, form, loading }: FormDetailsCardProps) {
    return (
        <Card>
            <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <ClipboardList className="h-4 w-4" />
                        Form Details
                    </span>
                    <Link href={`/admin/forms/${resourceId}`}>
                        <Button variant="ghost" size="sm">
                            View in Admin
                            <ExternalLink className="h-3 w-3 ml-1" />
                        </Button>
                    </Link>
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                {loading ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                ) : form ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <Label className="text-xs text-muted-foreground">Status</Label>
                            <div className="mt-1">
                                <Badge variant={getFormStatus(form).variant}>
                                    {getFormStatus(form).label}
                                </Badge>
                            </div>
                        </div>
                        <div className="col-span-2">
                            <Label className="text-xs text-muted-foreground">Title</Label>
                            <p className="mt-1 truncate">{form.title || "(untitled)"}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Submissions</Label>
                            <p className="mt-1 flex items-center gap-1">
                                <Inbox className="h-3 w-3" />
                                {form.submissionsCount}{form.maxSubmissions ? `/${form.maxSubmissions}` : ""}
                            </p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Created</Label>
                            <p className="mt-1">{formatDateTime(form.createdAt)}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Closes</Label>
                            <p className="mt-1">
                                {form.closesAt ? formatDateTime(form.closesAt) : "Never"}
                            </p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">File Uploads</Label>
                            <p className="mt-1">{form.allowFileUploads ? "Allowed" : "Disabled"}</p>
                        </div>
                        {form.customKey && (
                            <div>
                                <Label className="text-xs text-muted-foreground">Security</Label>
                                <p className="mt-1 flex items-center gap-1">
                                    <Lock className="h-3 w-3" /> Password
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Form not found or deleted</p>
                )}
            </CardContent>
        </Card>
    )
}
