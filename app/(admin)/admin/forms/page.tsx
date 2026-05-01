import { Suspense } from "react"
import { FormTable } from "@/components/admin/form-table"
import { getAdminForms } from "@/lib/data/admin"

interface FormsPageProps {
    searchParams: Promise<{ search?: string; filter?: string; page?: string }>
}

export default async function FormsPage({ searchParams }: FormsPageProps) {
    const params = await searchParams
    const { forms, total, page, totalPages, search, filter } = await getAdminForms(params)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Forms</h1>
                <p className="text-muted-foreground">
                    Manage E2EE forms, takedowns, and submissions.
                </p>
            </div>

            <Suspense>
                <FormTable
                    forms={forms}
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
