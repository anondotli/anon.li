import { Users, FileBox, Mail, ClipboardList, Inbox, DollarSign } from "lucide-react"
import { PageHeader } from "@/components/admin/page-header"
import { StatCard } from "@/components/admin/stat-card"
import { ChartCard } from "@/components/admin/charts/chart-card"
import { RangeTabs } from "@/components/admin/charts/range-tabs"
import { AreaTrend } from "@/components/admin/charts/area-trend"
import { BarSeries } from "@/components/admin/charts/bar-series"
import {
    getAdminGrowthSeries,
    getAdminRevenueSeries,
    parseAnalyticsRange,
} from "@/lib/data/admin"

export const dynamic = "force-dynamic"

interface AnalyticsPageProps {
    searchParams: Promise<{ range?: string }>
}

export default async function AnalyticsPage({ searchParams }: AnalyticsPageProps) {
    const { range: rangeParam } = await searchParams
    const range = parseAnalyticsRange(rangeParam)

    const [growth, revenue] = await Promise.all([
        getAdminGrowthSeries(range),
        getAdminRevenueSeries(range),
    ])

    const usd = (n: number) =>
        new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" }).format(n)

    return (
        <div className="space-y-8">
            <PageHeader
                breadcrumbs={[{ label: "Admin", href: "/admin" }, { label: "Analytics" }]}
                title="Analytics"
                description={`Platform growth and revenue over the last ${range} days.`}
                actions={<RangeTabs current={range} />}
            />

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                <StatCard title="New Users" value={growth.totals.users} icon={Users} />
                <StatCard title="New Drops" value={growth.totals.drops} icon={FileBox} />
                <StatCard title="New Aliases" value={growth.totals.aliases} icon={Mail} />
                <StatCard title="New Forms" value={growth.totals.forms} icon={ClipboardList} />
                <StatCard title="Submissions" value={growth.totals.submissions} icon={Inbox} />
                <StatCard title="Est. MRR" value={usd(revenue.currentMrr)} icon={DollarSign} variant="success" />
            </div>

            <ChartCard
                title="Growth"
                description="New resources created per day"
                action={<RangeTabs current={range} />}
            >
                <AreaTrend
                    data={growth.points}
                    xKey="date"
                    series={[
                        { key: "users", label: "Users", color: "hsl(var(--foreground))" },
                        { key: "drops", label: "Drops", color: "hsl(var(--destructive))" },
                        { key: "aliases", label: "Aliases", color: "hsl(var(--muted-foreground))" },
                        { key: "forms", label: "Forms", color: "hsl(var(--chart-3))" },
                    ]}
                />
            </ChartCard>

            <div className="grid gap-6 lg:grid-cols-2">
                <ChartCard title="Form submissions" description="Submissions received per day">
                    <AreaTrend
                        data={growth.points}
                        xKey="date"
                        series={[{ key: "submissions", label: "Submissions", color: "hsl(var(--foreground))" }]}
                        height={240}
                    />
                </ChartCard>

                <ChartCard
                    title="New subscriptions"
                    description={`${revenue.activeSubscriptions} active · ${usd(revenue.currentMrr)} MRR`}
                >
                    <BarSeries
                        data={revenue.points}
                        xKey="date"
                        stacked
                        height={240}
                        series={[
                            { key: "stripe", label: "Stripe", color: "hsl(var(--foreground))" },
                            { key: "crypto", label: "Crypto", color: "hsl(var(--destructive))" },
                        ]}
                    />
                </ChartCard>
            </div>

            {revenue.mrrByProduct.length > 0 && (
                <ChartCard title="MRR by product" description="Estimated from current active subscriptions">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                        {revenue.mrrByProduct.map((row) => (
                            <div
                                key={row.product}
                                className="flex items-center justify-between rounded-lg border p-3"
                            >
                                <span className="text-sm font-medium capitalize">{row.product}</span>
                                <span className="text-sm font-semibold tabular-nums">{usd(row.mrr)}</span>
                            </div>
                        ))}
                    </div>
                </ChartCard>
            )}
        </div>
    )
}
