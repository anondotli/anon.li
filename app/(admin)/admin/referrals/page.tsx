import { Suspense } from "react"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminReferrals } from "@/lib/data/admin"
import { ReferralsTable, ReferralsTableSkeleton } from "./referrals-table"

export default async function ReferralsPage({
    searchParams
}: {
    searchParams: Promise<{ [key: string]: string | string[] | undefined }>
}) {
    const params = await searchParams

    return (
        <div className="space-y-8">
            <PageHeader
                title="Referrals"
                description="Successful referrals and the complimentary Plus they grant."
            />

            {/* Keyed on params so a search/page change shows the skeleton again. */}
            <Suspense key={JSON.stringify(params)} fallback={<ReferralsTableSkeleton />}>
                <ReferralsData params={params} />
            </Suspense>
        </div>
    )
}

async function ReferralsData({ params }: { params: { [key: string]: string | string[] | undefined } }) {
    const data = await getAdminReferrals(params)
    return <ReferralsTable {...data} />
}
