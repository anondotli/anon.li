import { FormBuilderPage } from "@/components/form/dashboard/builder-page"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getFormLimitsAsync } from "@/lib/limits"
import { getEffectiveTiers } from "@/lib/entitlements"
import { scopeFromSession } from "@/lib/auth-session"
import { isOrgSubscribed } from "@/lib/data/auth"

export const metadata = {
    title: "New form",
}

export default async function NewFormPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    // Purchase-first Teams: an unsubscribed team can't create forms — send the
    // owner to the Team page to subscribe (the create UI is gated there too).
    const scope = scopeFromSession(session)
    if (scope.organizationId && !(await isOrgSubscribed(scope.organizationId))) {
        redirect("/dashboard/team")
    }

    const [limits, tiers] = await Promise.all([
        getFormLimitsAsync(session.user.id),
        getEffectiveTiers(session.user.id),
    ])

    return <FormBuilderPage limits={limits} currentTier={tiers.form} />
}
