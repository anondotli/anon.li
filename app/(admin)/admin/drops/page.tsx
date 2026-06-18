import { Suspense } from "react"
import { DropTable } from "@/components/admin/drop-table"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminDrops } from "@/lib/data/admin"

interface DropsPageProps {
    searchParams: Promise<{ search?: string; filter?: string; page?: string }>
}

export default async function DropsPage({ searchParams }: DropsPageProps) {
    const params = await searchParams
    const { drops, total, page, totalPages, search, filter } = await getAdminDrops(params)

    return (
        <div className="space-y-6">
            <PageHeader
                title="Drops"
                description="Manage file drops, takedowns, and deletions."
            />

            <Suspense>
                <DropTable
                    drops={drops}
                    total={total}
                    page={page}
                    totalPages={totalPages}
                    search={search}
                    filter={filter}
                />
            </Suspense>
        </div>
    )
}
