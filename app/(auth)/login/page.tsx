import { Suspense } from "react"
import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { sanitizeAuthCallbackUrl } from "@/lib/safe-callback-url"
import { requiresTwoFactorChallenge } from "@/lib/access-policy"
import { LoginPageContent } from "./login-content"

export const metadata = {
    title: "Login",
    description: "Login to your account",
}

interface LoginPageProps {
    searchParams: Promise<{ callbackUrl?: string | string[] }>
}

export default async function LoginPage({ searchParams }: LoginPageProps) {
    const session = await auth()
    if (session) {
        // Already signed in: honor a pending callback (e.g. an invitation or
        // OAuth consent that bounced here) instead of always landing on aliases.
        const { callbackUrl } = await searchParams
        const destination = sanitizeAuthCallbackUrl(typeof callbackUrl === "string" ? callbackUrl : null)
        // ...but a session still owing its 2FA challenge goes through /2fa first.
        if (requiresTwoFactorChallenge(session)) {
            redirect(`/2fa?callbackUrl=${encodeURIComponent(destination)}`)
        }
        redirect(destination)
    }

    return (
        <Suspense fallback={null}>
            <LoginPageContent />
        </Suspense>
    )
}
