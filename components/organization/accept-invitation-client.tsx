"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { toast } from "sonner"
import { AlertCircle, Building2, Loader2 } from "lucide-react"

interface InvitationView {
    organizationName?: string
    email?: string
    role?: string
}

/**
 * Map a better-auth invitation error into a distinct, actionable message so the
 * user can tell apart an expired link, an already-used/canceled invite, a
 * wrong-account mismatch, and an already-member case (instead of one generic
 * "invalid or expired" for everything).
 */
function friendlyInvitationError(message: string | undefined, fallback: string): string {
    const m = (message ?? "").toLowerCase()
    if (m.includes("expire")) {
        return "This invitation has expired. Ask a team admin to send a new one."
    }
    if (m.includes("already") && m.includes("member")) {
        return "You're already a member of this team."
    }
    if (m.includes("recipient") || m.includes("not for") || (m.includes("email") && m.includes("match"))) {
        return "This invitation was sent to a different email address. Sign in with that address to accept it."
    }
    if (m.includes("not found") || m.includes("invalid") || m.includes("canceled") || m.includes("cancelled")) {
        return "This invitation link is no longer valid — it may have been canceled or already used."
    }
    return message || fallback
}

export function AcceptInvitationClient({ invitationId }: { invitationId: string }) {
    const router = useRouter()
    const [invitation, setInvitation] = useState<InvitationView | null>(null)
    const [loading, setLoading] = useState(true)
    const [busy, setBusy] = useState(false)
    const [error, setError] = useState<string | null>(null)

    useEffect(() => {
        let active = true
        authClient.organization
            .getInvitation({ query: { id: invitationId } })
            .then(({ data, error }) => {
                if (!active) return
                if (error || !data) {
                    setError(friendlyInvitationError(error?.message, "This invitation is invalid or has expired."))
                } else {
                    setInvitation(data as InvitationView)
                }
                setLoading(false)
            })
        return () => {
            active = false
        }
    }, [invitationId])

    const accept = async () => {
        setBusy(true)
        setError(null)
        const { data, error } = await authClient.organization.acceptInvitation({ invitationId })
        if (error) {
            const message = friendlyInvitationError(error.message, "Failed to accept invitation")
            setError(message)
            toast.error(message)
            setBusy(false)
            return
        }
        const organizationId = data?.invitation?.organizationId
        if (organizationId) {
            await authClient.organization.setActive({ organizationId })
        }
        toast.success("You've joined the team")
        router.push("/dashboard/team")
        router.refresh()
    }

    const reject = async () => {
        setBusy(true)
        setError(null)
        const { error } = await authClient.organization.rejectInvitation({ invitationId })
        if (error) {
            const message = error.message || "Failed to decline invitation"
            setError(message)
            toast.error(message)
            setBusy(false)
            return
        }
        router.push("/dashboard")
    }

    if (loading) {
        return (
            <div className="flex justify-center py-12">
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
        )
    }

    if (error && !invitation) {
        return (
            <Card className="mx-auto max-w-md">
                <CardHeader className="text-center">
                    <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10 text-destructive">
                        <AlertCircle className="h-6 w-6" />
                    </div>
                    <CardTitle>Invitation unavailable</CardTitle>
                    <CardDescription>{error}</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button asChild variant="outline" className="w-full">
                        <Link href="/dashboard">Back to dashboard</Link>
                    </Button>
                </CardContent>
            </Card>
        )
    }

    return (
        <Card className="mx-auto max-w-md">
            <CardHeader className="text-center">
                <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                    <Building2 className="h-6 w-6 text-primary" />
                </div>
                <CardTitle>Join {invitation?.organizationName ?? "the team"}</CardTitle>
                <CardDescription>
                    You&apos;ve been invited to collaborate on anon.li{invitation?.role ? ` as ${invitation.role}` : ""}.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
                {error && (
                    <div className="flex items-start gap-2 rounded-lg border border-destructive/20 bg-destructive/10 px-3 py-2.5 text-sm text-destructive">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}
                <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={reject} disabled={busy}>
                        Decline
                    </Button>
                    <Button className="flex-1" onClick={accept} disabled={busy}>
                        {busy ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        Accept
                    </Button>
                </div>
            </CardContent>
        </Card>
    )
}
