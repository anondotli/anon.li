import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/admin/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { DomainVerificationStatus, VerificationBadge } from "@/components/admin/verification-badge"
import { UserLink } from "@/components/admin/entity-link"
import { formatRelativeTime } from "@/lib/admin/format"
import { getAdminDomainDetail } from "@/lib/data/admin"
import { DomainActions } from "./domain-actions"
import { ArrowLeft } from "lucide-react"

export default async function DomainDetailPage({
    params
}: {
    params: Promise<{ domainId: string }>
}) {
    const { domainId } = await params
    const data = await getAdminDomainDetail(domainId)

    if (!data) {
        notFound()
    }

    const { domain, aliases } = data

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/domains">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Domains
                    </Link>
                </Button>
            </div>

            <PageHeader
                title={domain.domain}
                description="Domain details and verification status"
                actions={<DomainActions domain={domain} />}
            />

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Domain Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Domain</span>
                            <span className="font-mono">{domain.domain}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Status</span>
                            <VerificationBadge verified={domain.verified} />
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Owner</span>
                            <UserLink user={domain.user} />
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Created</span>
                            <span>{formatRelativeTime(domain.createdAt)}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Catch-all</span>
                            <Badge variant={domain.catchAll ? "default" : "secondary"}>
                                {domain.catchAll ? "Enabled" : "Disabled"}
                            </Badge>
                        </div>
                        {domain.catchAllRecipient && (
                            <div className="flex justify-between items-start gap-4">
                                <span className="text-muted-foreground">Catch-all Recipient</span>
                                <Link
                                    href={`/admin/recipients/${domain.catchAllRecipient.id}`}
                                    className="font-mono text-sm text-primary hover:underline"
                                >
                                    {domain.catchAllRecipient.email}
                                </Link>
                            </div>
                        )}
                        {domain.scheduledForRemovalAt && (
                            <div className="flex justify-between">
                                <span className="text-muted-foreground">Scheduled Removal</span>
                                <span>{formatRelativeTime(domain.scheduledForRemovalAt)}</span>
                            </div>
                        )}
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Verification Token</span>
                            <code className="text-xs bg-muted px-2 py-1 rounded">
                                {domain.verificationToken}
                            </code>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>Verification Status</CardTitle>
                        <CardDescription>DNS record verification checks</CardDescription>
                    </CardHeader>
                    <CardContent>
                        <DomainVerificationStatus domain={domain} />

                        {domain.dkimSelector && (
                            <div className="mt-4 pt-4 border-t">
                                <div className="text-sm text-muted-foreground mb-2">DKIM Selector</div>
                                <code className="text-xs bg-muted px-2 py-1 rounded">
                                    {domain.dkimSelector}
                                </code>
                            </div>
                        )}

                        {domain.dkimPublicKey && (
                            <div className="mt-4">
                                <div className="text-sm text-muted-foreground mb-2">DKIM Public Key</div>
                                <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                                    {domain.dkimPublicKey}
                                </pre>
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Linked Aliases ({aliases.length})</CardTitle>
                    <CardDescription>Aliases using this domain</CardDescription>
                </CardHeader>
                <CardContent>
                    {aliases.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No aliases on this domain yet.</p>
                    ) : (
                        <div className="space-y-2">
                            {aliases.map((alias: (typeof aliases)[number]) => (
                                <div key={alias.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                    <div>
                                        <Link
                                            href={`/admin/aliases/${alias.id}`}
                                            className="font-mono text-sm text-primary hover:underline"
                                        >
                                            {alias.email}
                                        </Link>
                                        <div className="text-xs text-muted-foreground">
                                            Owner: {alias.user?.email || "Unknown"}
                                        </div>
                                    </div>
                                    <Badge variant={alias.active ? "default" : "secondary"}>
                                        {alias.active ? "Active" : "Inactive"}
                                    </Badge>
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    )
}
