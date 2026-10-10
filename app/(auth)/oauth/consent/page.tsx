import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth-session"
import { requiresTwoFactorChallenge } from "@/lib/access-policy"
import { ConsentForm } from "./consent-form"
import { parseHttpsOrLoopbackHttpUrl, parseHttpsUrl } from "@/lib/url-safety"
import { registeredRedirectOrigins } from "@/lib/mcp/client-registration"
import { parseConsentRequest } from "@/lib/mcp/consent"
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"

export const dynamic = "force-dynamic"

export const metadata = {
    title: "Authorize application",
    description: "Approve an OAuth application to access your anon.li account",
}

interface ConsentPageProps {
    // The query better-auth's OAuth provider signed when it redirected here
    // (client_id, scope, redirect_uri, state, PKCE, resource, exp, sig, …).
    searchParams: Promise<Record<string, string | string[] | undefined>>
}

const SCOPE_DESCRIPTIONS: Record<string, string> = {
    openid: "Identify you as an anon.li user.",
    profile: "Read your public profile.",
    email: "Read your email address.",
    offline_access: "Stay connected while you're not actively using the app (refresh tokens).",
    "anon.li:aliases": "Create, list, toggle, and delete your email aliases, and manage their forwarding recipients.",
    "anon.li:drops": "List, toggle, and delete your encrypted file drops (cannot read file contents).",
    "anon.li:forms": "List, toggle, and delete your encrypted forms (cannot read submission contents).",
}

function ExpiredRequest() {
    return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center px-4 py-10">
            <Card className="w-full">
                <CardHeader className="space-y-3 text-center">
                    <CardTitle>Authorization request expired</CardTitle>
                    <CardDescription>
                        This authorization link is invalid or has expired. Return to the app and connect
                        to anon.li again.
                    </CardDescription>
                </CardHeader>
            </Card>
        </div>
    )
}

export default async function OAuthConsentPage({ searchParams }: ConsentPageProps) {
    const request = await parseConsentRequest(await searchParams)
    if (!request) return <ExpiredRequest />

    // Signed-out authorize requests are sent here too (the provider's login
    // page), so bounce through /login — and /2fa — back to this exact URL.
    const next = `/oauth/consent?${request.oauthQuery}`
    const session = await getSession()
    if (!session) {
        redirect(`/login?callbackUrl=${encodeURIComponent(next)}`)
    }
    // A session that skipped its 2FA challenge (e.g. magic link) must not be
    // able to grant third-party access to the account. Come back here after.
    // (The consent endpoint enforces the same rule server-side.)
    if (requiresTwoFactorChallenge(session)) redirect(`/2fa?callbackUrl=${encodeURIComponent(next)}`)

    const client = await prisma.oauthClient.findUnique({
        where: { clientId: request.clientId },
        select: { name: true, clientId: true, disabled: true, redirectUris: true, clientDiscoveryId: true },
    }).catch(() => null)

    if (!client || client.disabled) notFound()

    // Client ID Metadata Document clients are identified by an HTTPS URL; show
    // whose domain published the metadata.
    const publisher = client.clientDiscoveryId ? parseHttpsUrl(client.clientId)?.host ?? null : null
    const target = parseHttpsOrLoopbackHttpUrl(request.redirectUri)?.origin ?? null
    const redirectOrigins = registeredRedirectOrigins(client.redirectUris)

    return (
        <ConsentForm
            oauthQuery={request.oauthQuery}
            clientName={client.name?.trim() || client.clientId}
            publisher={publisher}
            redirectOrigins={target ? [target, ...redirectOrigins.filter((origin) => origin !== target)] : redirectOrigins}
            scopes={request.scopes.map((s) => ({
                key: s,
                description: SCOPE_DESCRIPTIONS[s] ?? `Scope: ${s}`,
            }))}
            userEmail={session.user.email ?? ""}
        />
    )
}
