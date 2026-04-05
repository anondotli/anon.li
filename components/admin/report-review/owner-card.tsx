"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { ExternalLink, User, Loader2 } from "lucide-react"
import { getPlanName } from "@/lib/admin/format"
import { getStrikesBadge } from "./utils"

interface OwnerUser {
    id: string
    email: string
    tosViolations: number
    banned: boolean
    banAliasCreation?: boolean
    banFileUpload?: boolean
    stripePriceId: string | null
    isAdmin: boolean
}

interface OwnerCardProps {
    user?: OwnerUser | null
    loading: boolean
    serviceType: "drop" | "alias" | string
}

export function OwnerCard({ user, loading, serviceType }: OwnerCardProps) {
    return (
        <Card>
            <CardHeader className="py-3">
                <CardTitle className="text-sm font-medium flex items-center justify-between">
                    <span className="flex items-center gap-2">
                        <User className="h-4 w-4" />
                        Owner
                    </span>
                    {user && (
                        <Link href={`/admin/users/${user.id}`}>
                            <Button variant="ghost" size="sm">
                                View User
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
                ) : user ? (
                    <div className="space-y-2">
                        <p className="font-mono text-sm">{user.email}</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <Badge variant="outline">
                                {getPlanName(user.stripePriceId)}
                            </Badge>
                            {user.isAdmin && (
                                <Badge className="bg-purple-500/10 text-purple-500 border-purple-500/20">
                                    Admin
                                </Badge>
                            )}
                            {user.banned && (
                                <Badge variant="destructive">Banned</Badge>
                            )}
                            {serviceType === "drop" && user.banFileUpload && (
                                <Badge variant="secondary">Upload Banned</Badge>
                            )}
                            {serviceType === "alias" && user.banAliasCreation && (
                                <Badge variant="secondary">Alias Creation Banned</Badge>
                            )}
                            <Badge variant="outline" className={getStrikesBadge(user.tosViolations).className}>
                                {getStrikesBadge(user.tosViolations).label}
                            </Badge>
                        </div>
                    </div>
                ) : (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground">
                        <User className="h-4 w-4" />
                        {serviceType === "drop"
                            ? "Anonymous Upload — No user action possible"
                            : "No owner found"}
                    </div>
                )}
            </CardContent>
        </Card>
    )
}
