import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminBilling } from "@/lib/data/admin"
import { BillingTables } from "./billing-tables"

export default async function BillingPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams
    const data = await getAdminBilling(params)

    return (
        <div className="space-y-8">
            <PageHeader
                title="Billing"
                description="Subscriptions, crypto payments, and legacy billing state."
            />

            <Suspense>
                <BillingTables {...data} />
            </Suspense>
        </div>
    )
}
