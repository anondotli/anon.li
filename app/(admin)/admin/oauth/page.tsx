import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { OauthAppsTable } from "./oauth-table"
import { getAdminOauthApps } from "@/lib/data/admin"

export default async function OauthAppsPage({
    searchParams,
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { apps, total, page, totalPages, search, filter } = await getAdminOauthApps(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="OAuth Applications"
                description="OAuth/MCP clients connected to user accounts."
            />

            <Suspense>
                <OauthAppsTable
                    apps={apps}
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
