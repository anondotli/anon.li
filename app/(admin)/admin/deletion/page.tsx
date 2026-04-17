import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminDeletionRequests } from "@/lib/data/admin"
import { DeletionTable } from "./deletion-table"

export default async function DeletionPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { requests, total, page, totalPages, search, status } = await getAdminDeletionRequests(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Deletion Retry Queue"
                description="Failed immediate account deletions that need retry."
            />

            <Suspense>
                <DeletionTable
                    requests={requests}
                    total={total}
                    page={page}
                    totalPages={totalPages}
                    search={search}
                    status={status}
                />
            </Suspense>
        </div>
    )
}
