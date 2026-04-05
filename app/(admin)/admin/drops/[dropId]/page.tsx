import { notFound } from "next/navigation"
import { getAdminDropDetail } from "@/lib/data/admin"
import { DropDetailClient } from "./drop-detail-client"

interface DropDetailPageProps {
    params: Promise<{ dropId: string }>
}

export default async function DropDetailPage({ params }: DropDetailPageProps) {
    const { dropId } = await params
    const drop = await getAdminDropDetail(dropId)

    if (!drop) {
        notFound()
    }

    return <DropDetailClient drop={drop} />
}
