import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { Button } from "@/components/ui/button"
import { FormService } from "@/lib/services/form"
import { getEffectiveTiers } from "@/lib/entitlements"
import { getFormLimitsAsync } from "@/lib/limits"
import { FormListClient } from "@/components/form/dashboard/list-client"
import { Plus } from "lucide-react"
import { cn } from "@/lib/utils"

export const metadata = {
    title: "Forms",
    description: "Private, end-to-end encrypted forms for confidential intake.",
}

export default async function FormDashboardPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const [list, tiers, limits, recentSubmissions] = await Promise.all([
        FormService.listForms(session.user.id, { limit: 100 }),
        getEffectiveTiers(session.user.id),
        getFormLimitsAsync(session.user.id),
        FormService.countRecentSubmissionsForOwner(session.user.id),
    ])

    const submissionsLimit = limits.submissionsPerMonth
    const formsPercent = limits.forms === -1
        ? 0
        : Math.min((list.total / limits.forms) * 100, 100)
    const submissionsPercent = submissionsLimit === -1
        ? 0
        : Math.min((recentSubmissions / submissionsLimit) * 100, 100)

    return (
        <div className="flex flex-col gap-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border/40 pb-6">
                <div className="space-y-1">
                    <h1 className="text-3xl font-medium tracking-tight font-serif">Forms</h1>
                    <p className="text-muted-foreground font-light">
                        Build end-to-end encrypted forms and manage responses.
                    </p>
                </div>
                <Button className="flex items-center gap-2 shrink-0" asChild>
                    <Link href="/dashboard/form/new">
                        <Plus className="h-4 w-4 mr-2" />
                        New form
                    </Link>
                </Button>
            </div>

            <div className="grid gap-4 md:grid-cols-2">
                <UsageMeter
                    label="Forms"
                    used={list.total}
                    limit={limits.forms}
                    percent={formsPercent}
                    showUpgradeLink={tiers.form === "free"}
                />
                <UsageMeter
                    label="Submissions"
                    used={recentSubmissions}
                    limit={submissionsLimit}
                    percent={submissionsPercent}
                    caption="Rolling 30-day window"
                    showUpgradeLink={tiers.form === "free"}
                />
            </div>

            <FormListClient forms={serialize(list.forms)} />
        </div>
    )
}

function serialize(forms: Awaited<ReturnType<typeof FormService.listForms>>["forms"]) {
    return forms.map((f) => ({
        ...f,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
        closesAt: f.closesAt?.toISOString() ?? null,
    }))
}

interface UsageMeterProps {
    label: string
    used: number
    limit: number
    percent: number
    caption?: string
    showUpgradeLink?: boolean
}

function UsageMeter({ label, used, limit, percent, caption, showUpgradeLink }: UsageMeterProps) {
    const unlimited = limit === -1
    const barColor = unlimited
        ? "bg-primary"
        : percent >= 80
            ? "bg-destructive"
            : percent >= 60
                ? "bg-amber-500"
                : "bg-primary"

    return (
        <div className="border rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
                <span className="text-sm font-medium">{label}</span>
                <span className="text-sm text-muted-foreground">
                    {used.toLocaleString()} / {unlimited ? "∞" : limit.toLocaleString()}
                </span>
            </div>
            <div className="relative h-2 w-full overflow-hidden rounded-full bg-primary/20">
                <div
                    className={cn("h-full transition-all", barColor)}
                    style={{ width: `${percent}%` }}
                />
            </div>
            <div className="flex items-center justify-between gap-3">
                {caption ? (
                    <span className="text-xs text-muted-foreground">{caption}</span>
                ) : <span />}
                {showUpgradeLink && !unlimited && percent >= 80 && (
                    <Link href="/pricing?form" className="text-xs font-medium text-primary hover:underline">
                        Upgrade →
                    </Link>
                )}
            </div>
        </div>
    )
}
