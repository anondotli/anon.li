import { FormBuilderPage } from "@/components/form/dashboard/builder-page"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { getFormLimitsAsync } from "@/lib/limits"
import { getEffectiveTiers } from "@/lib/entitlements"

export const metadata = {
    title: "New form",
}

export default async function NewFormPage() {
    const session = await auth()
    if (!session?.user?.id) redirect("/login")

    const [limits, tiers] = await Promise.all([
        getFormLimitsAsync(session.user.id),
        getEffectiveTiers(session.user.id),
    ])

    return <FormBuilderPage limits={limits} currentTier={tiers.form} />
}
