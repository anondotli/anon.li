import { notFound } from "next/navigation"
import Link from "next/link"
import { PageHeader } from "@/components/admin/page-header"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { VerificationBadge } from "@/components/admin/verification-badge"
import { UserLink } from "@/components/admin/entity-link"
import { formatRelativeTime } from "@/lib/admin/format"
import { getAdminRecipientDetail } from "@/lib/data/admin"
import { RecipientActions } from "./recipient-actions"
import { ArrowLeft, Key } from "lucide-react"

export default async function RecipientDetailPage({
    params
}: {
    params: Promise<{ recipientId: string }>
}) {
    const { recipientId } = await params
    const recipient = await getAdminRecipientDetail(recipientId)

    if (!recipient) {
        notFound()
    }

    return (
        <div className="space-y-8">
            <div className="flex items-center gap-4">
                <Button variant="ghost" size="sm" asChild>
                    <Link href="/admin/recipients">
                        <ArrowLeft className="h-4 w-4 mr-2" />
                        Back to Recipients
                    </Link>
                </Button>
            </div>

            <PageHeader
                title={recipient.email}
                description="Recipient details and linked aliases"
                actions={<RecipientActions recipient={recipient} />}
            />

            <div className="grid gap-6 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Recipient Information</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Email</span>
                            <span className="font-mono">{recipient.email}</span>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Status</span>
                            <VerificationBadge verified={recipient.verified} />
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Owner</span>
                            <UserLink user={recipient.user} />
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Default</span>
                            <Badge variant={recipient.isDefault ? "default" : "secondary"}>
                                {recipient.isDefault ? "Yes" : "No"}
                            </Badge>
                        </div>
                        <div className="flex justify-between">
                            <span className="text-muted-foreground">Created</span>
                            <span>{formatRelativeTime(recipient.createdAt)}</span>
                        </div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle className="flex items-center gap-2">
                            <Key className="h-5 w-5" />
                            PGP Encryption
                        </CardTitle>
                        <CardDescription>
                            {recipient.pgpPublicKey ? "PGP encryption is configured" : "No PGP key configured"}
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        {recipient.pgpPublicKey ? (
                            <div className="space-y-4">
                                {recipient.pgpKeyName && (
                                    <div>
                                        <div className="text-sm text-muted-foreground mb-1">Key Name</div>
                                        <span className="font-medium">{recipient.pgpKeyName}</span>
                                    </div>
                                )}
                                {recipient.pgpFingerprint && (
                                    <div>
                                        <div className="text-sm text-muted-foreground mb-1">Fingerprint</div>
                                        <code className="text-xs bg-muted px-2 py-1 rounded">
                                            {recipient.pgpFingerprint}
                                        </code>
                                    </div>
                                )}
                                <div>
                                    <div className="text-sm text-muted-foreground mb-1">Public Key</div>
                                    <pre className="text-xs bg-muted p-2 rounded overflow-x-auto max-h-32">
                                        {recipient.pgpPublicKey.slice(0, 200)}...
                                    </pre>
                                </div>
                            </div>
                        ) : (
                            <p className="text-muted-foreground text-sm">
                                This recipient does not have PGP encryption configured.
                                Emails will be forwarded without end-to-end encryption.
                            </p>
                        )}
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Linked Aliases ({recipient.aliases.length})</CardTitle>
                    <CardDescription>Aliases forwarding to this recipient</CardDescription>
                </CardHeader>
                <CardContent>
                    {recipient.aliases.length === 0 ? (
                        <p className="text-muted-foreground text-sm">No aliases linked to this recipient.</p>
                    ) : (
                        <div className="space-y-2">
                            {recipient.aliases.map((alias: NonNullable<Awaited<ReturnType<typeof getAdminRecipientDetail>>>['aliases'][number]) => (
                                <div key={alias.id} className="flex items-center justify-between py-2 border-b last:border-0">
                                    <div>
                                        <Link
                                            href={`/admin/aliases/${alias.id}`}
                                            className="font-mono text-sm text-primary hover:underline"
                                        >
                                            {alias.email}
                                        </Link>
                                        {alias.label && (
                                            <span className="ml-2 text-xs text-muted-foreground">
                                                ({alias.label})
                                            </span>
                                        )}
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
