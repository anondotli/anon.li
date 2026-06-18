import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, FileBox, ClipboardList, Mail, AlertTriangle, HardDrive, CreditCard, Building2, Wrench, LineChart } from "lucide-react"
import Link from "next/link"
import { StatCard } from "@/components/admin/stat-card"
import { PageHeader } from "@/components/admin/page-header"
import { ChartCard } from "@/components/admin/charts/chart-card"
import { AreaTrend } from "@/components/admin/charts/area-trend"
import { MiniSparkline } from "@/components/admin/charts/mini-sparkline"
import { formatBytes } from "@/lib/format"
import { getAdminDashboardStats, getAdminGrowthSeries } from "@/lib/data/admin"

export const dynamic = "force-dynamic"

export default async function AdminDashboard() {
    const [stats, growth] = await Promise.all([
        getAdminDashboardStats(),
        getAdminGrowthSeries(30),
    ])

    const spark = (key: "users" | "drops" | "aliases" | "forms") =>
        growth.points.map((p) => p[key] as number)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Admin Dashboard"
                description="Overview of platform activity and resources."
                actions={
                    <Link
                        href="/admin/analytics"
                        className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm font-medium transition-colors hover:bg-muted"
                    >
                        <LineChart className="h-4 w-4" />
                        View analytics
                    </Link>
                }
            />

            {stats.pendingReports > 0 && (
                <StatCard
                    title="Pending Reports"
                    value={stats.pendingReports}
                    description="Abuse reports awaiting review"
                    icon={AlertTriangle}
                    href="/admin/reports"
                    variant="destructive"
                />
            )}

            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
                <StatCard
                    title="Total Users"
                    value={stats.totalUsers}
                    description={`${stats.activeUsers} active (30d) · ${stats.bannedUsers} banned`}
                    icon={Users}
                    href="/admin/users"
                    delta={stats.deltas.users}
                    sparkline={<MiniSparkline values={spark("users")} />}
                />

                <StatCard
                    title="Total Drops"
                    value={stats.totalDrops}
                    description={`${stats.takenDownDrops} taken down`}
                    icon={FileBox}
                    href="/admin/drops"
                    delta={stats.deltas.drops}
                    sparkline={<MiniSparkline values={spark("drops")} color="hsl(var(--destructive))" />}
                />

                <StatCard
                    title="Total Aliases"
                    value={stats.totalAliases}
                    description="Email forwarding aliases"
                    icon={Mail}
                    href="/admin/aliases"
                    delta={stats.deltas.aliases}
                    sparkline={<MiniSparkline values={spark("aliases")} />}
                />

                <StatCard
                    title="Total Forms"
                    value={stats.totalForms}
                    description={`${stats.takenDownForms} taken down`}
                    icon={ClipboardList}
                    href="/admin/forms"
                    delta={stats.deltas.forms}
                    sparkline={<MiniSparkline values={spark("forms")} />}
                />

                <StatCard
                    title="Organizations"
                    value={stats.totalOrganizations}
                    description={`${stats.totalMembers} members · ${stats.activeBusinessSubs} on Business`}
                    icon={Building2}
                    href="/admin/organizations"
                />

                <StatCard
                    title="Storage Used"
                    value={formatBytes(stats.totalStorage)}
                    description="Across all users"
                    icon={HardDrive}
                    href="/admin/maintenance/storage"
                />

                <StatCard
                    title="Active Paid Subs"
                    value={stats.activeSubscriptions}
                    description={`${stats.waitingCryptoPayments} crypto payments waiting`}
                    icon={CreditCard}
                    href="/admin/billing"
                />

                <StatCard
                    title="Maintenance"
                    value={stats.orphanedFiles + stats.activeDeletionRequests}
                    description={`${stats.orphanedFiles} orphaned files · ${stats.activeDeletionRequests} deletion retries`}
                    icon={Wrench}
                    href="/admin/maintenance"
                    variant={stats.orphanedFiles > 0 || stats.activeDeletionRequests > 0 ? "destructive" : "default"}
                />
            </div>

            <ChartCard
                title="Growth (30 days)"
                description="New users, drops, aliases, and forms per day"
                action={
                    <Link href="/admin/analytics" className="text-sm text-muted-foreground hover:text-foreground">
                        Details →
                    </Link>
                }
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
                    height={260}
                />
            </ChartCard>

            <div className="grid gap-4 md:grid-cols-2">
                <Card>
                    <CardHeader>
                        <CardTitle>Quick Actions</CardTitle>
                        <CardDescription>Common administrative tasks</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Link
                            href="/admin/users?filter=banned"
                            className="block p-3 rounded-lg hover:bg-muted transition-colors"
                        >
                            <div className="font-medium">Review Banned Users</div>
                            <div className="text-sm text-muted-foreground">
                                View and manage banned accounts
                            </div>
                        </Link>
                        <Link
                            href="/admin/drops?filter=takendown"
                            className="block p-3 rounded-lg hover:bg-muted transition-colors"
                        >
                            <div className="font-medium">View Takedowns</div>
                            <div className="text-sm text-muted-foreground">
                                Review taken down content
                            </div>
                        </Link>
                        <Link
                            href="/admin/reports"
                            className="block p-3 rounded-lg hover:bg-muted transition-colors"
                        >
                            <div className="font-medium">Process Reports</div>
                            <div className="text-sm text-muted-foreground">
                                Handle abuse reports
                            </div>
                        </Link>
                        <Link
                            href="/admin/maintenance/deletion"
                            className="block p-3 rounded-lg hover:bg-muted transition-colors"
                        >
                            <div className="font-medium">Deletion Queue</div>
                            <div className="text-sm text-muted-foreground">
                                Retry failed immediate account deletions
                            </div>
                        </Link>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>System Status</CardTitle>
                        <CardDescription>Platform health indicators</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Active Users (30d)</span>
                            <span className="text-sm font-medium">{stats.activeUsers}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Urgent Reports</span>
                            <span className={`text-sm font-medium ${stats.urgentReports > 0 ? "text-destructive" : ""}`}>
                                {stats.urgentReports}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Pending Reports</span>
                            <span className={`text-sm font-medium ${stats.pendingReports > 0 ? "text-destructive" : ""}`}>
                                {stats.pendingReports}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Orphaned Files</span>
                            <span className={`text-sm font-medium ${stats.orphanedFiles > 0 ? "text-destructive" : ""}`}>
                                {stats.orphanedFiles}
                            </span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Scheduled Removals</span>
                            <span className="text-sm font-medium">{stats.scheduledRemovals}</span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
