import { Suspense } from "react"
import { AliasTable } from "@/components/admin/alias-table"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminAliases } from "@/lib/data/admin"

interface AliasesPageProps {
    searchParams: Promise<{ search?: string; filter?: string; page?: string }>
}

export default async function AliasesPage({ searchParams }: AliasesPageProps) {
    const params = await searchParams
    const { aliases, total, page, totalPages, search, filter } = await getAdminAliases(params)

    return (
        <div className="space-y-6">
            <PageHeader
                title="Aliases"
                description="Manage email forwarding aliases."
            />

            <Suspense>
                <AliasTable
                    aliases={aliases}
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
