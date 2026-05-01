import { notFound } from "next/navigation"
import { getAdminFormDetail } from "@/lib/data/admin"
import { FormDetailClient } from "./form-detail-client"

interface FormDetailPageProps {
    params: Promise<{ formId: string }>
}

export default async function FormDetailPage({ params }: FormDetailPageProps) {
    const { formId } = await params
    const form = await getAdminFormDetail(formId)

    if (!form) {
        notFound()
    }

    return <FormDetailClient form={form} />
}
