import { Suspense } from "react"
import { UserTable } from "@/components/admin/user-table"
import { getAdminUsers } from "@/lib/data/admin"

interface UsersPageProps {
    searchParams: Promise<{ search?: string; filter?: string; page?: string }>
}

export default async function UsersPage({ searchParams }: UsersPageProps) {
    const params = await searchParams
    const { users, total, page, totalPages, search, filter } = await getAdminUsers(params)

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-3xl font-bold tracking-tight">Users</h1>
                <p className="text-muted-foreground">
                    Manage user accounts, bans, and subscriptions.
                </p>
            </div>

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
