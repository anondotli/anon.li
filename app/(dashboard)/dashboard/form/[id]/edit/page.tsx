import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { FormBuilderPage } from "@/components/form/dashboard/builder-page"
import { NotFoundError, ForbiddenError } from "@/lib/api-error-utils"
import { FormSchemaDoc } from "@/lib/form-schema"
import { getFormLimitsAsync } from "@/lib/limits"
import { getEffectiveTiers } from "@/lib/entitlements"
import { FormService } from "@/lib/services/form"

interface PageProps {
    params: Promise<{ id: string }>
}

export const metadata = {
    title: "Edit form",
}

export default async function EditFormPage({ params }: PageProps) {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const { id } = await params
    let form: Awaited<ReturnType<typeof FormService.getFormForOwner>>

    try {
        form = await FormService.getFormForOwner(id, session.user.id)
    } catch (error) {
        if (error instanceof NotFoundError) notFound()
        if (error instanceof ForbiddenError) notFound()
        throw error
    }

    const schema = FormSchemaDoc.parse(JSON.parse(form.schemaJson))
    const [limits, tiers] = await Promise.all([
        getFormLimitsAsync(session.user.id),
        getEffectiveTiers(session.user.id),
    ])

    return (
        <FormBuilderPage
            mode="edit"
            limits={limits}
            currentTier={tiers.form}
            initialForm={{
                id: form.id,
                title: form.title,
                description: form.description,
                schema,
                allowFileUploads: form.allowFileUploads,
                maxSubmissions: form.maxSubmissions,
                closesAt: form.closesAt?.toISOString() ?? null,
                hideBranding: form.hideBranding,
                submissionsCount: form.submissionsCount,
                notifyOnSubmission: form.notifyEmailFallback || form.notifyAliasId !== null,
                customKey: form.customKey,
                disabledByUser: form.disabledByUser,
            }}
        />
    )
}
