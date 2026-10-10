import { notFound } from "next/navigation"
import { AdminService } from "@/lib/services/admin"
import { NotFoundError } from "@/lib/api-error-utils"
import { ReportReviewPage } from "@/components/admin/report-review-page"

interface ReportDetailPageProps {
    params: Promise<{ id: string }>
}

export default async function ReportDetailPage({ params }: ReportDetailPageProps) {
    const { id } = await params

    let data
    try {
        data = await AdminService.getReportWithContext(id)
    } catch (error) {
        // Only a missing report is a 404; DB/decrypt failures must surface.
        if (error instanceof NotFoundError) notFound()
        throw error
    }

    return <ReportReviewPage data={data} />
}
