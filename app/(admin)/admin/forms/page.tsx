import { Suspense } from "react"
import { FormTable } from "@/components/admin/form-table"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminForms } from "@/lib/data/admin"

interface FormsPageProps {
    searchParams: Promise<{ search?: string; filter?: string; page?: string }>
}

export default async function FormsPage({ searchParams }: FormsPageProps) {
    const params = await searchParams
    const { forms, total, page, totalPages, search, filter } = await getAdminForms(params)

    return (
        <div className="space-y-6">
            <PageHeader
                title="Forms"
                description="Manage E2EE forms, takedowns, and submissions."
            />

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
