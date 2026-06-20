import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { sanitizeAuthCallbackUrl } from "@/lib/safe-callback-url"
import { SetupPasswordPageContent } from "./setup-password-content"

export const metadata = {
    title: "Setup Password",
    description: "Finish configuring your encrypted vault",
}

interface SetupPageProps {
    searchParams: Promise<{ callbackUrl?: string }>
}

export default async function SetupPasswordPage({ searchParams }: SetupPageProps) {
    const { callbackUrl: rawCallbackUrl } = await searchParams
    const callbackUrl = sanitizeAuthCallbackUrl(rawCallbackUrl)

    const session = await auth()
    if (!session?.user) {
        redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    }

    if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
        redirect("/2fa")
    }

    const security = await prisma.userSecurity.findUnique({
        where: { userId: session.user.id },
        select: { id: true },
    })

    if (security) {
        redirect(callbackUrl)
    }

    return <SetupPasswordPageContent callbackUrl={callbackUrl} />
}
