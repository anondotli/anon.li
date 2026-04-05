import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/admin/page-header"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { VerificationBadge } from "@/components/admin/verification-badge"
import { UserLink } from "@/components/admin/entity-link"
import { formatRelativeTime, formatDateTime } from "@/lib/admin/format"
import { getAdminAliasDetail } from "@/lib/data/admin"
import { AliasActions } from "./alias-actions"
import { ArrowLeft, Mail, MailX, Clock, Tag, FileText, Globe, Inbox, Users } from "lucide-react"

export default async function AliasDetailPage({
    params
}: {
    params: Promise<{ aliasId: string }>
}) {
    const { aliasId } = await params
    const data = await getAdminAliasDetail(aliasId)

    if (!data) {
        notFound()
    }

    const { alias, domain } = data

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/aliases">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Aliases
                    </Link>
                </Button>
            </div>

            <PageHeader
                title={alias.email}
                description="Alias details and statistics"
                actions={<AliasActions alias={alias} />}
            />

            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Emails Received</CardTitle>
                        <Mail className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{alias.emailsReceived}</div>
                        <p className="text-xs text-muted-foreground">Total forwarded</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Emails Blocked</CardTitle>
                        <MailX className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{alias.emailsBlocked}</div>
                        <p className="text-xs text-muted-foreground">Spam/blocked</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Last Email</CardTitle>
                        <Clock className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">
                            {alias.lastEmailAt ? formatRelativeTime(alias.lastEmailAt) : "Never"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {alias.lastEmailAt ? formatDateTime(alias.lastEmailAt) : "No emails yet"}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Status</CardTitle>
                    </CardHeader>
                    <CardContent>
                        <Badge variant={alias.active ? "default" : "secondary"} className="text-lg px-3 py-1">
                            {alias.active ? "Active" : "Inactive"}
                        </Badge>
                    </CardContent>
                </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Alias Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between items-start">
                            <span className="text-muted-foreground flex items-center gap-2">
                                <Mail className="h-4 w-4" /> Email
                            </span>
                            <span className="font-mono text-right">{alias.email}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Format</span>
                            <Badge variant="outline">{alias.format}</Badge>
                        </div>
                        {alias.label && (
                            <div className="flex justify-between items-start">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <Tag className="h-4 w-4" /> Label
                                </span>
                                <span>{alias.label}</span>
                            </div>
                        )}
                        {alias.note && (
                            <div className="flex justify-between items-start">
                                <span className="text-muted-foreground flex items-center gap-2">
                                    <FileText className="h-4 w-4" /> Note
                                </span>
                                <span className="text-right max-w-[200px]">{alias.note}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Created</span>
                            <span>{formatRelativeTime(alias.createdAt)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Related Resources</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <Users className="h-4 w-4" /> Owner
                            </div>
                            <UserLink user={alias.user} />
                        </div>

                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <Inbox className="h-4 w-4" /> Recipient
                            </div>
                            {alias.recipient ? (
                                <div className="flex items-center justify-between">
                                    <Link
                                        href={`/admin/recipients/${alias.recipient.id}`}
                                        className="font-mono text-sm text-primary hover:underline"
                                    >
                                        {alias.recipient.email}
                                    </Link>
                                    <VerificationBadge verified={alias.recipient.verified} size="sm" />
                                </div>
                            ) : (
                                <span className="text-muted-foreground">No recipient</span>
                            )}
                        </div>

                        <div className="p-3 rounded-lg bg-muted/50">
                            <div className="flex items-center gap-2 text-sm text-muted-foreground mb-1">
                                <Globe className="h-4 w-4" /> Domain
                            </div>
                            {domain ? (
                                <div className="flex items-center justify-between">
                                    <Link
                                        href={`/admin/domains/${domain.id}`}
                                        className="font-mono text-sm text-primary hover:underline"
                                    >
                                        {domain.domain}
                                    </Link>
                                    <VerificationBadge verified={domain.verified} size="sm" />
                                </div>
                            ) : (
                                <span className="font-mono text-sm">{alias.domain} (system)</span>
                            )}
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
