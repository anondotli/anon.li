import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminAuditLogs } from "@/lib/data/admin"
import { AuditTable } from "./audit-table"

export default async function AuditPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { logs, actions, total, page, totalPages, search, action } = await getAdminAuditLogs(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Audit Logs"
                description="Sensitive admin and security events."
            />

            <Suspense>
                <AuditTable
                    logs={logs}
                    actions={actions}
                    total={total}
                    page={page}
                    totalPages={totalPages}
                    search={search}
                    action={action}
                />
            </Suspense>
        </div>
    )
}
