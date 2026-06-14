import { redirect } from "next/navigation"
import { auth } from "@/auth"
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

    // Must be signed in to accept; bounce through login and come back here.
    if (!session?.user?.id) {
        redirect(`/login?callbackURL=${encodeURIComponent(`/accept-invitation/${id}`)}`)
    }

    return (
        <div className="container flex min-h-screen items-center justify-center py-12">
            <AcceptInvitationClient invitationId={id} />
        </div>
    )
}
