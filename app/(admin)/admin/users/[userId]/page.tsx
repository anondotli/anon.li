import { notFound } from "next/navigation"
import { getAdminUserDetail } from "@/lib/data/admin"
import { UserDetailClient } from "./user-detail-client"

interface UserDetailPageProps {
    params: Promise<{ userId: string }>
}

export default async function UserDetailPage({ params }: UserDetailPageProps) {
    const { userId } = await params
    const user = await getAdminUserDetail(userId)

    if (!user) {
        notFound()
    }

    return <UserDetailClient user={user} />
}
