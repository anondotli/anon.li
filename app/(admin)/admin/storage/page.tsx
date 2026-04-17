import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminStorageOps } from "@/lib/data/admin"
import { StorageTable } from "./storage-table"

export default async function StoragePage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { orphanedFiles, oldestCreatedAt, total, page, totalPages } = await getAdminStorageOps(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Storage Cleanup"
                description="Orphaned storage deletion backlog."
            />

            <Suspense>
                <StorageTable
                    orphanedFiles={orphanedFiles}
                    oldestCreatedAt={oldestCreatedAt}
                    total={total}
                    page={page}
                    totalPages={totalPages}
                />
            </Suspense>
        </div>
    )
}
