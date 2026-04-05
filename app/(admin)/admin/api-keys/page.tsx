import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { ApiKeysTable } from "./api-keys-table"
import { getAdminApiKeys } from "@/lib/data/admin"

export default async function ApiKeysPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { apiKeys, total, page, totalPages, search } = await getAdminApiKeys(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="API Keys"
                description="Manage API keys for programmatic access."
            />

            <Suspense>
                <ApiKeysTable
                    apiKeys={apiKeys}
                    total={total}
                    page={page}
                    totalPages={totalPages}
                    search={search}
                />
            </Suspense>
        </div>
    )
}
