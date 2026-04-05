import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { DomainsTable } from "./domains-table"
import { getAdminDomains } from "@/lib/data/admin"

export default async function DomainsPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { domains, total, page, totalPages, search, filter } = await getAdminDomains(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Domains"
                description="Manage custom domains for email forwarding."
            />

            <Suspense>
                <DomainsTable
                    domains={domains}
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
