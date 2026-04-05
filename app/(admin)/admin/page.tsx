import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Users, FileBox, Mail, AlertTriangle, HardDrive } from "lucide-react"
import Link from "next/link"
import { StatCard } from "@/components/admin/stat-card"
import { PageHeader } from "@/components/admin/page-header"
import { formatBytes } from "@/lib/admin/format"
import { getAdminDashboardStats } from "@/lib/data/admin"

export const dynamic = "force-dynamic"

export default async function AdminDashboard() {
    const stats = await getAdminDashboardStats()

    return (
        <div className="space-y-8">
            <PageHeader
                title="Admin Dashboard"
                description="Overview of platform activity and resources."
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
                />

                <StatCard
                    title="Total Drops"
                    value={stats.totalDrops}
                    description={`${stats.takenDownDrops} taken down`}
                    icon={FileBox}
                    href="/admin/drops"
                />

                <StatCard
                    title="Total Aliases"
                    value={stats.totalAliases}
                    description="Email forwarding aliases"
                    icon={Mail}
                    href="/admin/aliases"
                />

                <StatCard
                    title="Storage Used"
                    value={formatBytes(stats.totalStorage)}
                    description="Across all users"
                    icon={HardDrive}
                />
            </div>

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
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader>
                        <CardTitle>System Status</CardTitle>
                        <CardDescription>Platform health indicators</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Database</span>
                            <span className="text-sm text-green-500 font-medium">Connected</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Active Users (30d)</span>
                            <span className="text-sm font-medium">{stats.activeUsers}</span>
                        </div>
                        <div className="flex items-center justify-between">
                            <span className="text-sm">Pending Reports</span>
                            <span className={`text-sm font-medium ${stats.pendingReports > 0 ? "text-destructive" : ""}`}>
                                {stats.pendingReports}
                            </span>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
