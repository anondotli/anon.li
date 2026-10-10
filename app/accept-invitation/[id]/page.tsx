import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { requiresTwoFactorChallenge } from "@/lib/access-policy"
import { AcceptInvitationClient } from "@/components/organization/accept-invitation-client"

interface PageProps {
    params: Promise<{ id: string }>
}

export const metadata = {
    title: "Accept invitation",
}

export default async function AcceptInvitationPage({ params }: PageProps) {
    const { id } = await params
    const session = await auth()

    const invitationPath = `/accept-invitation/${encodeURIComponent(id)}`

    // Must be signed in to accept; bounce through login and come back here.
    if (!session?.user?.id) {
        redirect(`/login?callbackUrl=${encodeURIComponent(invitationPath)}`)
    }
    // A session still owing its 2FA challenge must finish it before joining.
    if (requiresTwoFactorChallenge(session)) {
        redirect(`/2fa?callbackUrl=${encodeURIComponent(invitationPath)}`)
    }

    return (
        <div className="container flex min-h-screen items-center justify-center py-12">
            <AcceptInvitationClient invitationId={id} />
        </div>
    )
}
