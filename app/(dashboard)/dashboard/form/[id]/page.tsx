import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { scopeFromSession } from "@/lib/auth-session"
import { FormService } from "@/lib/services/form"
import { NotFoundError, ForbiddenError } from "@/lib/api-error-utils"
import { FormSchemaDoc } from "@/lib/form-schema"
import { FormResponsesClient } from "@/components/form/dashboard/responses"

interface PageProps {
    params: Promise<{ id: string }>
}

export default async function FormDetailPage({ params }: PageProps) {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const { id } = await params
    const scope = scopeFromSession(session)
    let form: Awaited<ReturnType<typeof FormService.getFormForOwner>>
    let submissions: Awaited<ReturnType<typeof FormService.listSubmissions>>
    let stats: Awaited<ReturnType<typeof FormService.getSubmissionStats>>

    try {
        form = await FormService.getFormForOwner(id, scope)
        ;[submissions, stats] = await Promise.all([
            FormService.listSubmissions(id, scope, { limit: 50 }),
            FormService.getSubmissionStats(id, scope),
        ])
    } catch (error) {
        if (error instanceof NotFoundError) notFound()
        if (error instanceof ForbiddenError) notFound()
        throw error
    }

    const schema = FormSchemaDoc.parse(JSON.parse(form.schemaJson))

    return (
        <FormResponsesClient
            form={{
                id: form.id,
                title: form.title,
                description: form.description,
                active: form.active,
                disabledByUser: form.disabledByUser,
                takenDown: form.takenDown,
                submissionsCount: form.submissionsCount,
                maxSubmissions: form.maxSubmissions,
                closesAt: form.closesAt?.toISOString() ?? null,
                allowFileUploads: form.allowFileUploads,
                createdAt: form.createdAt.toISOString(),
                hasOwnerKey: form.ownerKey !== null,
                fields: schema.fields.map((field) => ({
                    id: field.id,
                    label: field.label,
                    type: field.type,
                    options: "options" in field ? field.options : undefined,
                    max: field.type === "rating" ? field.max : undefined,
                })),
            }}
            submissions={submissions.submissions.map((s) => ({
                id: s.id,
                createdAt: s.createdAt.toISOString(),
                readAt: s.readAt?.toISOString() ?? null,
                hasAttachedDrop: s.hasAttachedDrop,
            }))}
            stats={stats}
        />
    )
}
