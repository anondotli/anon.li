import { FormBuilderPage } from "@/components/form/dashboard/builder-page"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { scopeFromSession } from "@/lib/auth-session"
import { getFormOwnerEntitlements } from "@/lib/services/form-entitlements"

export const metadata = {
    title: "New form",
}

export default async function NewFormPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    // Purchase-first Teams: an unsubscribed team can't create forms — send the
    // owner to the Team page to subscribe (the create UI is gated there too).
    const scope = scopeFromSession(session)
    const { limits, tiers, subscribed } = await getFormOwnerEntitlements(scope)
    if (scope.organizationId && !subscribed) {
        redirect("/dashboard/team")
    }

    return <FormBuilderPage limits={limits} currentTier={tiers.form} />
}
