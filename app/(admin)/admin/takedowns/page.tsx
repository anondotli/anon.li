import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { TakedownsTable } from "./takedowns-table"
import { getAdminTakedowns } from "@/lib/data/admin"

export default async function TakedownsPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { drops, total, page, totalPages, search } = await getAdminTakedowns(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Takedowns"
                description="View and manage taken down content."
            />

            <Suspense>
                <TakedownsTable
                    drops={drops}
                    total={total}
                    page={page}
                    totalPages={totalPages}
                    search={search}
                />
            </Suspense>
        </div>
    )
}
