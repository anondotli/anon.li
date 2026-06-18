import { redirect } from "next/navigation"
import Link from "next/link"
import { auth } from "@/auth"
import { scopeFromSession } from "@/lib/auth-session"
import { isOrgSubscribed } from "@/lib/data/auth"
import { Button } from "@/components/ui/button"
import { TeamWorkspaceLocked } from "@/components/dashboard/team/team-workspace-locked"
import { FormService } from "@/lib/services/form"
import { getEffectiveTiers } from "@/lib/entitlements"
import { getFormLimitsAsync } from "@/lib/limits"
import { FormListClient } from "@/components/form/dashboard/list-client"
import { UsageMeter } from "@/components/ui/usage-meter"
import { Plus } from "lucide-react"

export const metadata = {
    title: "Forms",
    description: "Private, end-to-end encrypted forms for confidential intake.",
}

export default async function FormDashboardPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    // Purchase-first Teams: an unsubscribed team is a zero-capacity workspace.
    const scope = scopeFromSession(session)
    if (scope.organizationId && !(await isOrgSubscribed(scope.organizationId))) {
        return (
            <div className="flex flex-col gap-8">
                <div className="flex flex-col gap-4 border-b border-border/40 pb-6 sm:flex-row sm:items-center sm:justify-between">
                    <div className="space-y-1">
                        <h1 className="text-3xl font-medium tracking-tight font-serif">Forms</h1>
                        <p className="text-muted-foreground font-light">
                            Build end-to-end encrypted forms and manage responses.
                        </p>
                    </div>
                </div>
                <TeamWorkspaceLocked resource="forms" />
            </div>
        )
    }

    const [list, tiers, limits, recentSubmissions] = await Promise.all([
        FormService.listForms(scope, { limit: 100 }),
        getEffectiveTiers(session.user.id),
        getFormLimitsAsync(session.user.id),
        FormService.countRecentSubmissionsForOwner(session.user.id),
    ])

    const submissionsLimit = limits.submissionsPerMonth
    const upgradeHref = tiers.form === "free" ? "/pricing?form" : undefined

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
                <UsageMeter label="Forms" used={list.total} limit={limits.forms} upgradeHref={upgradeHref} />
                <UsageMeter
                    label="Submissions"
                    used={recentSubmissions}
                    limit={submissionsLimit}
                    caption="Rolling 30-day window"
                    upgradeHref={upgradeHref}
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
