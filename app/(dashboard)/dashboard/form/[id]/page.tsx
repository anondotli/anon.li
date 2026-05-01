import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { FormService } from "@/lib/services/form"
import { NotFoundError, ForbiddenError } from "@/lib/api-error-utils"
import { FormSchemaDoc } from "@/lib/form-schema"
import { FormDetailClient } from "@/components/form/dashboard/detail-client"

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function FormDetailPage({ params }: PageProps) {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const { id } = await params
    let form: Awaited<ReturnType<typeof FormService.getFormForOwner>>
    let submissions: Awaited<ReturnType<typeof FormService.listSubmissions>>

    try {
        form = await FormService.getFormForOwner(id, session.user.id)
        submissions = await FormService.listSubmissions(id, session.user.id, { limit: 50 })
    } catch (error) {
        if (error instanceof NotFoundError) notFound()
        if (error instanceof ForbiddenError) notFound()
        throw error
    }

    const schema = FormSchemaDoc.parse(JSON.parse(form.schemaJson))

    return (
        <FormDetailClient
            form={{
                id: form.id,
                title: form.title,
                description: form.description,
                active: form.active,
                disabledByUser: form.disabledByUser,
                takenDown: form.takenDown,
                submissionsCount: form.submissionsCount,
                allowFileUploads: form.allowFileUploads,
                createdAt: form.createdAt.toISOString(),
                hasOwnerKey: form.ownerKey !== null,
                fieldLabels: Object.fromEntries(schema.fields.map((field) => [field.id, field.label])),
                fieldOrder: schema.fields.map((field) => field.id),
            }}
            submissions={submissions.submissions.map((s) => ({
                id: s.id,
                createdAt: s.createdAt.toISOString(),
                readAt: s.readAt?.toISOString() ?? null,
                hasAttachedDrop: s.hasAttachedDrop,
            }))}
            total={submissions.total}
        />
    )
}
