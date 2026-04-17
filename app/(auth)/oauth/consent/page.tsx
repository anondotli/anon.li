import { notFound, redirect } from "next/navigation"
import { prisma } from "@/lib/prisma"
import { getSession } from "@/lib/auth-session"
import { ConsentForm } from "./consent-form"

export const dynamic = "force-dynamic"

export const metadata = {
    title: "Authorize application",
    description: "Approve an OAuth application to access your anon.li account",
}

interface ConsentPageProps {
    searchParams: Promise<{
        consent_code?: string
        client_id?: string
        scope?: string
    }>
}

const SCOPE_DESCRIPTIONS: Record<string, string> = {
    openid: "Identify you as an anon.li user.",
    profile: "Read your public profile.",
    email: "Read your email address.",
    offline_access: "Stay connected while you're not actively using the app (refresh tokens).",
    "anon.li:aliases": "Create, list, toggle, and delete your email aliases.",
    "anon.li:drops": "List, toggle, and delete your encrypted file drops (cannot read file contents).",
}

export default async function OAuthConsentPage({ searchParams }: ConsentPageProps) {
    const { consent_code: consentCode, client_id: clientId, scope } = await searchParams
    if (!consentCode || !clientId) notFound()

    const session = await getSession()
    if (!session) {
        const next = `/oauth/consent?consent_code=${encodeURIComponent(consentCode)}&client_id=${encodeURIComponent(clientId)}&scope=${encodeURIComponent(scope ?? "")}`
        redirect(`/login?callbackUrl=${encodeURIComponent(next)}`)
    }

    const client = await prisma.oAuthApplication.findUnique({
        where: { clientId },
        select: { name: true, clientId: true, icon: true, disabled: true },
    }).catch(() => null)

    if (!client || client.disabled) notFound()

    const scopes = (scope ?? "").split(/\s+/).filter(Boolean)

    return (
        <ConsentForm
            consentCode={consentCode}
            clientName={client.name}
            clientIcon={client.icon ?? null}
            scopes={scopes.map((s) => ({
                key: s,
                description: SCOPE_DESCRIPTIONS[s] ?? `Scope: ${s}`,
            }))}
            userEmail={session.user.email ?? ""}
        />
    )
}
