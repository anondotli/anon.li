import { notFound } from "next/navigation"
import { AdminService } from "@/lib/services/admin"
import { ReportReviewPage } from "@/components/admin/report-review-page"

interface ReportDetailPageProps {
    params: Promise<{ id: string }>
}

export default async function ReportDetailPage({ params }: ReportDetailPageProps) {
    const { id } = await params

    let data
    try {
        data = await AdminService.getReportWithContext(id)
    } catch {
        notFound()
    }

    return <ReportReviewPage data={data} />
}
