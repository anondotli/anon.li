import { redirect } from "next/navigation"
import { auth } from "@/auth"
import { prisma } from "@/lib/prisma"
import { sanitizeAuthCallbackUrl } from "@/lib/safe-callback-url"
import { getVaultSession } from "@/lib/vault/server"
import { isVaultSessionFresh } from "@/lib/vault/session-freshness"
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
        // After 2FA, verifyTwoFactorLogin sends the user back through /setup
        // (if the vault still needs it) and then on to this destination.
        redirect(`/2fa?callbackUrl=${encodeURIComponent(callbackUrl)}`)
    }

    const [security, credentialAccount] = await Promise.all([
        prisma.userSecurity.findUnique({
            where: { userId: session.user.id },
            select: { id: true },
        }),
        prisma.account.findFirst({
            where: {
                userId: session.user.id,
                providerId: "credential",
            },
            select: { password: true },
        }),
    ])

    if (security) {
        redirect(callbackUrl)
    }

    // POST /api/vault/setup only accepts a recently created session. Check up
    // front so a stale session is offered "Sign in again" instead of failing
    // only after the user has typed (and we've derived) a new vault password.
    const vaultSession = await getVaultSession({ require2FA: false })
    const sessionFresh = Boolean(vaultSession && isVaultSessionFresh(vaultSession.session.createdAt))

    return (
        <SetupPasswordPageContent
            callbackUrl={callbackUrl}
            hasCredentialPassword={Boolean(credentialAccount?.password)}
            sessionFresh={sessionFresh}
        />
    )
}
