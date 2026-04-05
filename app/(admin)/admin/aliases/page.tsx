import { Suspense } from "react"
import { AliasTable } from "@/components/admin/alias-table"
import { getAdminAliases } from "@/lib/data/admin"

interface AliasesPageProps {
    searchParams: Promise<{ search?: string; filter?: string; page?: string }>
}

export default async function AliasesPage({ searchParams }: AliasesPageProps) {
    const params = await searchParams
    const { aliases, total, page, totalPages, search, filter } = await getAdminAliases(params)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Aliases</h1>
                <p className="text-muted-foreground">
                    Manage email forwarding aliases.
                </p>
            </div>

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
