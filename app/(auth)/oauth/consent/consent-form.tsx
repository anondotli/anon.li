"use client"

import { useState, useTransition } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { toast } from "sonner"

interface ConsentScope {
    key: string
    description: string
}

interface ConsentFormProps {
    consentCode: string
    clientName: string
    clientIcon: string | null
    scopes: ConsentScope[]
    userEmail: string
}

export function ConsentForm({ consentCode, clientName, clientIcon, scopes, userEmail }: ConsentFormProps) {
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
                const data = await res.json().catch(() => null)
                if (!res.ok) {
                    toast.error(data?.error_description || data?.message || "Authorization failed")
                    setDecision(null)
                    return
                }
                if (data?.redirectURI) {
                    window.location.href = data.redirectURI
                } else {
                    window.location.href = "/dashboard"
                }
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
                        />
                    ) : null}
                    <CardTitle>Authorize {clientName}</CardTitle>
                    <CardDescription>
                        {clientName} is requesting access to your anon.li account ({userEmail}).
                    </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
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
