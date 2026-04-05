import { Suspense } from "react"
import { ReportTable } from "@/components/admin/report-table"
import { getAdminReports } from "@/lib/data/admin"

interface ReportsPageProps {
    searchParams: Promise<{ status?: string; page?: string; type?: string; search?: string }>
}

export default async function ReportsPage({ searchParams }: ReportsPageProps) {
    const params = await searchParams
    const { reports, total, page, totalPages, status, serviceType, search } = await getAdminReports(params)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Abuse Reports</h1>
                <p className="text-muted-foreground">
                    Review and process abuse reports.
                </p>
            </div>

            <Suspense>
                <ReportTable
                    reports={reports}
                    total={total}
                    page={page}
                    totalPages={totalPages}
                    status={status}
                    serviceType={serviceType}
                    search={search}
                />
            </Suspense>
        </div>
    )
}
