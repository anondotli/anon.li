"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"
import { parseHttpsOrLoopbackHttpUrl } from "@/lib/url-safety"

interface ConsentScope {
    key: string
    description: string
}

interface ConsentFormProps {
    consentCode: string
    clientName: string
    clientIcon: string | null
    /** Origins the client is allowed to receive the authorization code at. */
    redirectOrigins: string[]
    scopes: ConsentScope[]
    userEmail: string
}

export function ConsentForm({ consentCode, clientName, clientIcon, redirectOrigins, scopes, userEmail }: ConsentFormProps) {
    const [isPending, startTransition] = useTransition()
    const [decision, setDecision] = useState<"accept" | "deny" | null>(null)

    const submit = (accept: boolean) => {
        setDecision(accept ? "accept" : "deny")
        startTransition(async () => {
            try {
                const res = await fetch("/api/auth/oauth2/consent", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    credentials: "include",
                    body: JSON.stringify({ accept, consent_code: consentCode }),
                })
                const data: unknown = await res.json().catch(() => null)
                if (!res.ok) {
                    const error = data && typeof data === "object" ? data as Record<string, unknown> : null
                    const message = typeof error?.error_description === "string"
                        ? error.error_description
                        : typeof error?.message === "string"
                            ? error.message
                            : "Authorization failed"
                    toast.error(message)
                    setDecision(null)
                    return
                }
                const redirectValue = data && typeof data === "object" && "redirectURI" in data
                    ? (data as { redirectURI?: unknown }).redirectURI
                    : null
                const redirectUrl = parseHttpsOrLoopbackHttpUrl(redirectValue)
                if (!redirectUrl) {
                    toast.error("Authorization succeeded, but the client returned an unsafe redirect URL.")
                    setDecision(null)
                    return
                }
                window.location.assign(redirectUrl.toString())
            } catch {
                toast.error("Network error. Please try again.")
                setDecision(null)
            }
        })
    }

    return (
        <div className="mx-auto flex min-h-[60vh] w-full max-w-lg items-center px-4 py-10">
            <Card className="w-full">
                <CardHeader className="space-y-3 text-center">
                    {clientIcon ? (
                        <Image
                            src={clientIcon}
                            alt=""
                            width={56}
                            height={56}
                            className="mx-auto rounded-lg"
                            unoptimized
                            referrerPolicy="no-referrer"
                        />
                    ) : null}
                    <CardTitle>Authorize {clientName}</CardTitle>
                    <CardDescription>
                        {clientName} is requesting access to your anon.li account ({userEmail}).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                    {redirectOrigins.length > 0 ? (
                        <div className="rounded-lg border border-amber-500/50 bg-amber-500/10 p-4">
                            <p className="mb-2 text-sm font-medium">
                                Your authorization code will be sent to:
                            </p>
                            <ul className="space-y-1">
                                {redirectOrigins.map((origin) => (
                                    <li key={origin} className="break-all font-mono text-sm">
                                        {origin}
                                    </li>
                                ))}
                            </ul>
                            <p className="mt-2 text-xs text-muted-foreground">
                                {redirectOrigins.length > 1
                                    ? "This app can send your code to any of these addresses. Only continue if you recognize every one."
                                    : "Only continue if you recognize this address."}
                            </p>
                        </div>
                    ) : null}
                    <div className="rounded-lg border bg-muted/40 p-4">
                        <p className="mb-2 text-sm font-medium">This will allow the app to:</p>
                        <ul className="space-y-1.5 text-sm text-muted-foreground">
                            {scopes.map((s) => (
                                <li key={s.key} className="flex gap-2">
                                    <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                                    <span>{s.description}</span>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <p className="text-xs text-muted-foreground">
                        The app will use an API access token to act on your behalf. Requests count
                        toward your monthly API quota. You can revoke access at any time from your
                        account settings.
                    </p>
                    <div className="flex gap-3">
                        <Button
                            variant="outline"
                            className="flex-1"
                            disabled={isPending}
                            onClick={() => submit(false)}
                        >
                            {decision === "deny" && isPending ? "Denying…" : "Deny"}
                        </Button>
                        <Button
                            className="flex-1"
                            disabled={isPending}
                            onClick={() => submit(true)}
                        >
                            {decision === "accept" && isPending ? "Authorizing…" : "Authorize"}
                        </Button>
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
