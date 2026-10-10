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
    const { takedowns, total, page, totalPages, search, type } = await getAdminTakedowns(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Takedowns"
                description="View and manage taken down drops, forms, and aliases."
            />

            <Suspense>
                <TakedownsTable
                    takedowns={takedowns}
                    total={total}
                    page={page}
                    totalPages={totalPages}
                    search={search}
                    type={type}
                />
            </Suspense>
        </div>
    )
}
