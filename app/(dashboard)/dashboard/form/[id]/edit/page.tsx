import { redirect, notFound } from "next/navigation"
import { auth } from "@/auth"
import { scopeFromSession } from "@/lib/auth-session"
import { FormBuilderPage } from "@/components/form/dashboard/builder-page"
import { NotFoundError, ForbiddenError } from "@/lib/api-error-utils"
import { FormSchemaDoc } from "@/lib/form-schema"
import { FormService } from "@/lib/services/form"
import { getFormOwnerEntitlements } from "@/lib/services/form-entitlements"

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
    const scope = scopeFromSession(session)
    const { limits, tiers, subscribed } = await getFormOwnerEntitlements(scope)
    if (scope.organizationId && !subscribed) redirect("/dashboard/team")

    let form: Awaited<ReturnType<typeof FormService.getFormForOwner>>

    try {
        form = await FormService.getFormForOwner(id, scope)
    } catch (error) {
        if (error instanceof NotFoundError) notFound()
        if (error instanceof ForbiddenError) notFound()
        throw error
    }

    const schema = FormSchemaDoc.parse(JSON.parse(form.schemaJson))

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
