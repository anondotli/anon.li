"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, Mail, Loader2 } from "lucide-react"
import { formatDateTime } from "@/lib/admin/format"
import type { AliasDetails } from "./types"

interface AliasDetailsCardProps {
    alias?: AliasDetails | null
    loading: boolean
}

export function AliasDetailsCard({ alias, loading }: AliasDetailsCardProps) {
    return (
        <Card>
            <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <Mail className="h-4 w-4" />
                        Alias Details
                    </span>
                    {alias && (
                        <Link href={`/admin/aliases/${alias.id}`}>
                            <Button variant="ghost" size="sm">
                                View in Admin
                                <ExternalLink className="h-3 w-3 ml-1" />
                            </Button>
                        </Link>
                    )}
                </CardTitle>
            </CardHeader>
            <CardContent className="pt-0">
                {loading ? (
                    <div className="flex items-center justify-center py-4">
                        <Loader2 className="h-4 w-4 animate-spin" />
                    </div>
                ) : alias ? (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                        <div>
                            <Label className="text-xs text-muted-foreground">Alias</Label>
                            <p className="mt-1 font-mono text-sm truncate">{alias.email}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Status</Label>
                            <div className="mt-1">
                                <Badge variant={alias.active ? "default" : "secondary"}>
                                    {alias.active ? "Active" : "Inactive"}
                                </Badge>
                            </div>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Emails Received</Label>
                            <p className="mt-1">{alias.emailsReceived}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Emails Blocked</Label>
                            <p className="mt-1">{alias.emailsBlocked}</p>
                        </div>
                        <div>
                            <Label className="text-xs text-muted-foreground">Created</Label>
                            <p className="mt-1">{formatDateTime(alias.createdAt)}</p>
                        </div>
                    </div>
                ) : (
                    <p className="text-sm text-muted-foreground">Alias not found or deleted</p>
                )}
            </CardContent>
        </Card>
    )
}
