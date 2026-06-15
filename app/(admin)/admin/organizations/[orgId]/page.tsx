import { notFound } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Building2, Users, KeyRound, ShieldCheck } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Separator } from "@/components/ui/separator"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { UserLink } from "@/components/admin/entity-link"
import { getAdminOrgDetail } from "@/lib/data/admin"
import { formatDateTime, formatRelativeTime } from "@/lib/format"

interface OrgDetailPageProps {
    params: Promise<{ orgId: string }>
}

const ROLE_ORDER: Record<string, number> = { owner: 0, admin: 1, member: 2 }

function roleVariant(role: string) {
    if (role === "owner") return "default" as const
    if (role === "admin") return "secondary" as const
    return "outline" as const
}

function statusVariant(status: string) {
    return status === "active" || status === "trialing" ? "default" : "outline"
}

export default async function OrgDetailPage({ params }: OrgDetailPageProps) {
    const { orgId } = await params
    const org = await getAdminOrgDetail(orgId)

    if (!org) {
        notFound()
    }

    const members = [...org.members].sort((a, b) => {
        const ra = ROLE_ORDER[a.role] ?? 9
        const rb = ROLE_ORDER[b.role] ?? 9
        if (ra !== rb) return ra - rb
        return a.createdAt.getTime() - b.createdAt.getTime()
    })

    const resourceCounts: Array<{ label: string; value: number }> = [
        { label: "Aliases", value: org._count.aliases },
        { label: "Drops", value: org._count.drops },
        { label: "Forms", value: org._count.forms },
        { label: "Domains", value: org._count.domains },
        { label: "API Keys", value: org._count.apiKeys },
    ]

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/organizations">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Organizations
                    </Link>
                </Button>
            </div>

            <div className="flex items-start justify-between">
                <div>
                    <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
                        <Building2 className="h-7 w-7 text-muted-foreground" />
                        {org.name}
                    </h1>
                    <p className="text-muted-foreground">
                        <code className="text-xs">{org.slug}</code> · ID: {org.id}
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                        {org.enforce2FA && <Badge variant="outline" className="gap-1"><ShieldCheck className="h-3 w-3" /> 2FA enforced</Badge>}
                        {org.keyRotationRecommendedAt && (
                            <Badge variant="outline" className="text-orange-500 gap-1">
                                <KeyRound className="h-3 w-3" /> Key rotation recommended
                            </Badge>
                        )}
                        {org.orgKeyGeneration === 0 && <Badge variant="outline">Vault unseeded</Badge>}
                    </div>
                </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Members</CardTitle>
                        <Users className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${org._count.members > org.seatLimit ? "text-destructive" : ""}`}>
                            {org._count.members} / {org.seatLimit}
                        </div>
                        <p className="text-xs text-muted-foreground">{org._count.invitations} pending invitations</p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Plan</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold capitalize">
                            {org.activeSubscription ? `${org.activeSubscription.product} ${org.activeSubscription.tier}` : "Free"}
                        </div>
                        <p className="text-xs text-muted-foreground">
                            {org.activeSubscription ? `${org.activeSubscription.seats} seats · ${org.activeSubscription.status}` : "No active subscription"}
                        </p>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Vault Generation</CardTitle>
                        <KeyRound className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">{org.orgKeyGeneration}</div>
                        {org.keyRotationRecommendedAt && (
                            <p className="text-xs text-orange-500">
                                rotate since {formatRelativeTime(org.keyRotationRecommendedAt)}
                            </p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium">Created</CardTitle>
                        <Building2 className="h-4 w-4 text-muted-foreground" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold">{formatRelativeTime(org.createdAt)}</div>
                        <p className="text-xs text-muted-foreground">{formatDateTime(org.createdAt)}</p>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Owned Resources</CardTitle>
                    <CardDescription>Shared resources sealed to this organization.</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
                        {resourceCounts.map((resource) => (
                            <div key={resource.label}>
                                <div className="text-2xl font-bold">{resource.value}</div>
                                <div className="text-xs text-muted-foreground">{resource.label}</div>
                            </div>
                        ))}
                    </div>
                </CardContent>
            </Card>

            <Separator />

            <Card>
                <CardHeader>
                    <CardTitle>Members</CardTitle>
                    <CardDescription>{members.length} members</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>User</TableHead>
                                <TableHead>Role</TableHead>
                                <TableHead>Joined</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {members.map((member) => (
                                <TableRow key={member.id}>
                                    <TableCell><UserLink user={member.user} /></TableCell>
                                    <TableCell><Badge variant={roleVariant(member.role)} className="capitalize">{member.role}</Badge></TableCell>
                                    <TableCell>{formatRelativeTime(member.createdAt)}</TableCell>
                                </TableRow>
                            ))}
                            {members.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={3} className="text-center py-8 text-muted-foreground">No members</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Pending Invitations</CardTitle>
                        <CardDescription>Invitations awaiting acceptance.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {org.invitations.length > 0 ? (
                            <div className="space-y-2">
                                {org.invitations.map((invitation) => (
                                    <div key={invitation.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                        <div>
                                            <div className="text-sm">{invitation.email}</div>
                                            <div className="text-xs text-muted-foreground">
                                                invited by {invitation.inviter?.email ?? "—"} · expires {formatDateTime(invitation.expiresAt)}
                                            </div>
                                        </div>
                                        <Badge variant="outline" className="capitalize">{invitation.role ?? "member"}</Badge>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p className="text-sm text-muted-foreground">No pending invitations</p>
                        )}
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Subscriptions</CardTitle>
                        <CardDescription>Canonical Subscription records for this org.</CardDescription>
                    </CardHeader>
                    <CardContent>
                        {org.subscriptions.length > 0 ? (
                            <div className="space-y-3">
                                {org.subscriptions.map((subscription) => (
                                    <div key={subscription.id} className="rounded border p-3">
                                        <div className="flex items-center justify-between gap-3">
                                            <div className="font-medium capitalize">
                                                {subscription.product} {subscription.tier} · {subscription.seats} seats
                                            </div>
                                            <Badge variant={statusVariant(subscription.status)}>{subscription.status}</Badge>
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
                            <p className="text-sm text-muted-foreground">No subscription records.</p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Organization Audit Log</CardTitle>
                    <CardDescription>Latest 25 org-scoped events.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead>Action</TableHead>
                                <TableHead>Actor</TableHead>
                                <TableHead>Target</TableHead>
                                <TableHead>When</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {org.auditLogs.map((log) => (
                                <TableRow key={log.id}>
                                    <TableCell><Badge variant="outline">{log.action}</Badge></TableCell>
                                    <TableCell>
                                        {log.actor ? (
                                            <Link href={`/admin/users/${log.actor.id}`} className="text-sm hover:underline">
                                                {log.actor.email}
                                            </Link>
                                        ) : (
                                            <code className="text-xs text-muted-foreground">{log.actorId}</code>
                                        )}
                                    </TableCell>
                                    <TableCell>
                                        {log.targetId ? <code className="text-xs">{log.targetId}</code> : <span className="text-muted-foreground">-</span>}
                                    </TableCell>
                                    <TableCell>{formatRelativeTime(log.createdAt)}</TableCell>
                                </TableRow>
                            ))}
                            {org.auditLogs.length === 0 && (
                                <TableRow>
                                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">No audit events</TableCell>
                                </TableRow>
                            )}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    )
}
