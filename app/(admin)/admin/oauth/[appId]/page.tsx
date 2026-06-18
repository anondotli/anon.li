import { notFound } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { PageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { StatusBadge } from "@/components/admin/status-badge"
import { UserLink } from "@/components/admin/entity-link"
import { KeyRound, ShieldCheck, Ban, CheckCircle2 } from "lucide-react"
import { formatDate } from "@/lib/format"
import { getAdminOauthAppDetail } from "@/lib/data/admin"
import { OauthAppActions } from "./oauth-app-actions"

export default async function OauthAppDetailPage({
    params,
}: {
    params: Promise<{ appId: string }>
}) {
    const { appId } = await params
    const app = await getAdminOauthAppDetail(appId)

    if (!app) notFound()

    const redirectUrls = app.redirectUrls.split(/[\s,]+/).filter(Boolean)

    return (
        <div className="space-y-8">
            <PageHeader
                breadcrumbs={[
                    { label: "Admin", href: "/admin" },
                    { label: "OAuth Applications", href: "/admin/oauth" },
                    { label: app.name },
                ]}
                title={app.name}
                description="OAuth/MCP application"
                actions={<OauthAppActions app={app} variant="full" />}
            />

            <div className="flex flex-wrap items-center gap-2">
                {app.disabled ? (
                    <StatusBadge tone="danger" label="Disabled" icon={Ban} />
                ) : (
                    <StatusBadge tone="success" label="Active" icon={CheckCircle2} />
                )}
                <StatusBadge tone="neutral" label={app.type} />
            </div>

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                <StatCard title="Access Tokens" value={app.usage.tokens} icon={KeyRound} />
                <StatCard title="Consents" value={app.usage.consents} icon={ShieldCheck} />
                <StatCard title="Created" value={formatDate(app.createdAt)} icon={KeyRound} />
            </div>

            <Card>
                <CardHeader>
                    <CardTitle>Application Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-3 text-sm">
                    <Row label="Client ID" value={<code className="text-xs">{app.clientId}</code>} />
                    <Row label="Type" value={<span className="capitalize">{app.type}</span>} />
                    <Row label="Owner" value={<UserLink user={app.user} />} />
                    <Row label="Created" value={formatDate(app.createdAt)} />
                    <Row label="Updated" value={formatDate(app.updatedAt)} />
                    <div>
                        <div className="mb-1 text-muted-foreground">Redirect URLs</div>
                        {redirectUrls.length > 0 ? (
                            <ul className="space-y-1">
                                {redirectUrls.map((url) => (
                                    <li key={url}>
                                        <code className="break-all text-xs">{url}</code>
                                    </li>
                                ))}
                            </ul>
                        ) : (
                            <span className="text-muted-foreground">None</span>
                        )}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
    return (
        <div className="flex items-center justify-between gap-4">
            <span className="text-muted-foreground">{label}</span>
            <span className="text-right">{value}</span>
        </div>
    )
}
