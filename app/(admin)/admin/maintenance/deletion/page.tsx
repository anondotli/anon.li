import { Suspense } from "react"
import { getAdminDeletionRequests } from "@/lib/data/admin"
import { DeletionTable } from "./deletion-table"

export default async function MaintenanceDeletionPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { requests, total, page, totalPages, search, status } = await getAdminDeletionRequests(params)

    return (
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
    )
}
