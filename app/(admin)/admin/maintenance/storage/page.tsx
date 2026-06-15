import { Suspense } from "react"
import { getAdminStorageOps } from "@/lib/data/admin"
import { StorageTable } from "./storage-table"

export default async function MaintenanceStoragePage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { orphanedFiles, oldestCreatedAt, total, page, totalPages } = await getAdminStorageOps(params)

    return (
        <Suspense>
            <StorageTable
                orphanedFiles={orphanedFiles}
                oldestCreatedAt={oldestCreatedAt}
                total={total}
                page={page}
                totalPages={totalPages}
            />
        </Suspense>
    )
}
