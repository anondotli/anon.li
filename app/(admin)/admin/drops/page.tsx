import { Suspense } from "react"
import { DropTable } from "@/components/admin/drop-table"
import { getAdminDrops } from "@/lib/data/admin"

interface DropsPageProps {
    searchParams: Promise<{ search?: string; filter?: string; page?: string }>
}

export default async function DropsPage({ searchParams }: DropsPageProps) {
    const params = await searchParams
    const { drops, total, page, totalPages, search, filter } = await getAdminDrops(params)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Drops</h1>
                <p className="text-muted-foreground">
                    Manage file drops, takedowns, and deletions.
                </p>
            </div>

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
