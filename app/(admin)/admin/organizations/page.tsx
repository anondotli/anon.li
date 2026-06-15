import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminOrganizations } from "@/lib/data/admin"
import { OrganizationsTable, OrganizationsTableSkeleton } from "./organizations-table"

export default async function OrganizationsPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams

    return (
        <div className="space-y-8">
            <PageHeader
                title="Organizations"
                description="Teams, members, seats and shared resources."
            />

            {/* Keyed on params so a search/page change shows the skeleton again. */}
            <Suspense key={JSON.stringify(params)} fallback={<OrganizationsTableSkeleton />}>
                <OrganizationsData params={params} />
            </Suspense>
        </div>
    )
}

async function OrganizationsData({ params }: { params: { [key: string]: string | string[] | undefined } }) {
    const data = await getAdminOrganizations(params)
    return <OrganizationsTable {...data} />
}
