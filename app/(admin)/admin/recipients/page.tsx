import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { RecipientsTable } from "./recipients-table"
import { getAdminRecipients } from "@/lib/data/admin"

export default async function RecipientsPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const { recipients, total, page, totalPages, search, filter } = await getAdminRecipients(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Recipients"
                description="Manage email forwarding recipients."
            />

            <Suspense>
                <RecipientsTable
                    recipients={recipients}
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
