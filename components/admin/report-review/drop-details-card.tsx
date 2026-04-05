"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, FileBox, Lock, Download, CheckCircle, XCircle, Loader2 } from "lucide-react"
import { formatDateTime, formatBytes } from "@/lib/admin/format"
import { getDropStatus } from "./utils"
import type { DropDetails } from "./types"

interface DropDetailsCardProps {
    resourceId: string
    drop?: DropDetails | null
    loading: boolean
}

export function DropDetailsCard({ resourceId, drop, loading }: DropDetailsCardProps) {
    return (
        <Card>
            <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <FileBox className="h-4 w-4" />
                        Drop Details
                    </span>
                    <Link href={`/admin/drops/${resourceId}`}>
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
                ) : drop ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <Label className="text-xs text-muted-foreground">Status</Label>
                            <div className="mt-1">
                                <Badge variant={getDropStatus(drop).variant}>
                                    {getDropStatus(drop).label}
                                </Badge>
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Files</Label>
                            <p className="mt-1">
                                {drop.fileCount} file{drop.fileCount !== 1 ? 's' : ''} ({formatBytes(drop.totalSize)})
                            </p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Downloads</Label>
                            <p className="mt-1 flex items-center gap-1">
                                <Download className="h-3 w-3" />
                                {drop.downloads}{drop.maxDownloads ? `/${drop.maxDownloads}` : ''}
                            </p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Upload</Label>
                            <p className="mt-1 flex items-center gap-1">
                                {drop.uploadComplete ? (
                                    <><CheckCircle className="h-3 w-3 text-green-500" /> Complete</>
                                ) : (
                                    <><XCircle className="h-3 w-3 text-yellow-500" /> Incomplete</>
                                )}
                            </p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Created</Label>
                            <p className="mt-1">{formatDateTime(drop.createdAt)}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Expires</Label>
                            <p className="mt-1">
                                {drop.expiresAt ? formatDateTime(drop.expiresAt) : "Never"}
                            </p>
                        </div>
                        {drop.customKey && (
                            <div>
                                <Label className="text-xs text-muted-foreground">Security</Label>
                                <p className="mt-1 flex items-center gap-1">
                                    <Lock className="h-3 w-3" /> Password
                                </p>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Drop not found or deleted</p>
                )}
            </CardContent>
        </Card>
    )
}
