import { redirect } from "next/navigation"
import { ScrollText, ShieldAlert } from "lucide-react"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { getOrgAuditLogs } from "@/lib/data/audit"
import { meetsMinRole } from "@/lib/ownership"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { EmptyState } from "@/components/ui/empty-state"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"

export const metadata = {
    title: "Audit log",
    description: "Administrative and security events in your team.",
}

const ACTION_LABELS: Record<string, string> = {
    "org.member.add": "Member added",
    "org.member.remove": "Member removed",
    "org.member.role_change": "Role changed",
    "org.invitation.send": "Invitation sent",
    "org.domain.verify": "Domain verified",
    "org.billing.seats_change": "Seats changed",
    "org.billing.canceled": "Subscription canceled",
    "org.vault.grant": "Team key granted",
    "org.vault.rotate": "Team key rotated",
    "org.security.enforce_2fa_on": "2FA requirement enabled",
    "org.security.enforce_2fa_off": "2FA requirement disabled",
    "org.data.export": "Data exported",
}

/** Friendly fallback for any action we don't have an explicit label for. */
function humanizeAction(action: string): string {
    const last = action.split(".").pop() ?? action
    const words = last.replace(/_/g, " ")
    return words.charAt(0).toUpperCase() + words.slice(1)
}

const dateFmt = new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
})

function shorten(id: string): string {
    return id.length > 10 ? `${id.slice(0, 8)}…` : id
}

export default async function TeamAuditPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const orgId = session.activeOrganizationId
    const canView = Boolean(orgId) && meetsMinRole(session.activeOrgRole, "admin")

    if (!orgId || !canView) {
        return (
            <EmptyState
                icon={ShieldAlert}
                title="Audit log unavailable"
                description="Switch to a team you own or administer to view its audit log."
            />
        )
    }

    const logs = await getOrgAuditLogs(orgId, { limit: 200 })

    // Resolve actor/target user ids to display names (audit rows store raw ids).
    const ids = [...new Set(logs.flatMap((l) => [l.actorId, l.targetId]).filter((x): x is string => Boolean(x)))]
    const users = ids.length
        ? await prisma.user.findMany({ where: { id: { in: ids } }, select: { id: true, email: true, name: true } })
        : []
    const nameById = new Map(users.map((u) => [u.id, u.name || u.email || shorten(u.id)]))
    const label = (id: string | null) => (id ? (nameById.get(id) ?? shorten(id)) : "—")

    return (
        <div className="flex flex-col gap-8">
            <div className="space-y-1 border-b border-border/40 pb-6">
                <h2 className="text-3xl font-medium tracking-tight font-serif">Audit log</h2>
                <p className="text-muted-foreground font-light">
                    A record of administrative and security events in your team. Visible to owners and admins.
                </p>
            </div>

            {logs.length === 0 ? (
                <EmptyState
                    icon={ScrollText}
                    title="No events yet"
                    description="Administrative and security actions in your team will appear here."
                />
            ) : (
                <Card>
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[180px]">When</TableHead>
                                <TableHead>Event</TableHead>
                                <TableHead>Actor</TableHead>
                                <TableHead>Target</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {logs.map((l) => (
                                <TableRow key={l.id}>
                                    <TableCell className="text-muted-foreground whitespace-nowrap">
                                        {dateFmt.format(l.createdAt)}
                                    </TableCell>
                                    <TableCell>
                                        <Badge variant="secondary" className="font-normal">
                                            {ACTION_LABELS[l.action] ?? humanizeAction(l.action)}
                                        </Badge>
                                    </TableCell>
                                    <TableCell className="max-w-[200px] truncate" title={label(l.actorId)}>
                                        {label(l.actorId)}
                                    </TableCell>
                                    <TableCell className="max-w-[200px] truncate" title={label(l.targetId)}>
                                        {label(l.targetId)}
                                    </TableCell>
                                </TableRow>
                            ))}
                        </TableBody>
                    </Table>
                </Card>
            )}
        </div>
    )
}
