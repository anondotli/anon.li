import { Suspense } from "react"
import { UserTable } from "@/components/admin/user-table"
import { PageHeader } from "@/components/admin/page-header"
import { getAdminUsers } from "@/lib/data/admin"

interface UsersPageProps {
    searchParams: Promise<{ search?: string; filter?: string; page?: string }>
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
    const params = await searchParams
    const { users, total, page, totalPages, search, filter } = await getAdminUsers(params)

    return (
        <div className="space-y-6">
            <PageHeader
                title="Users"
                description="Manage user accounts, bans, and subscriptions."
            />

            <Suspense>
                <UserTable
                    users={users}
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
