"use client"

import { useState } from "react"
import { Blocks, Loader2, Unplug } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import {
    AlertDialog,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { revokeConnectedAppAction } from "@/actions/connected-apps"
import { formatRelativeTime } from "@/lib/format"
import type { ConnectedApp } from "@/lib/data/connected-apps"

interface ConnectedAppsProps {
    apps: ConnectedApp[]
}

export function ConnectedApps({ apps }: ConnectedAppsProps) {
    const [pendingRevoke, setPendingRevoke] = useState<ConnectedApp | null>(null)
    const [revokingId, setRevokingId] = useState<string | null>(null)

    const handleRevoke = async () => {
        if (!pendingRevoke) return
        const app = pendingRevoke
        setRevokingId(app.clientId)
        try {
            const result = await revokeConnectedAppAction(app.clientId)
            if (result.error) {
                toast.error(result.error)
            } else {
                toast.success(`${app.name} can no longer access your account`)
                setPendingRevoke(null)
            }
        } catch {
            toast.error("Failed to revoke access")
        } finally {
            setRevokingId(null)
        }
    }

    return (
        <Card id="connected-apps" className="scroll-mt-24 rounded-3xl border-border/40 shadow-sm">
            <CardHeader className="p-6 pb-4 sm:p-8 sm:pb-4">
                <CardTitle className="text-xl font-medium font-serif">Connected apps</CardTitle>
                <CardDescription>
                    AI assistants and other apps you&apos;ve authorized to access your account over MCP/OAuth.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-6 pt-4 sm:p-8 sm:pt-4">
                {apps.length === 0 ? (
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-border/60 bg-secondary/10 px-6 py-8 text-center">
                        <Blocks className="mb-3 h-5 w-5 text-muted-foreground" aria-hidden="true" />
                        <p className="text-sm font-medium">No connected apps</p>
                        <p className="mt-1 max-w-sm text-sm text-muted-foreground">
                            Apps you authorize, such as Claude, appear here so you can revoke their access.
                        </p>
                    </div>
                ) : (
                    <ul className="grid gap-3" aria-label="Connected apps">
                        {apps.map((app) => {
                            const isRevoking = revokingId === app.clientId
                            return (
                                <li
                                    key={app.clientId}
                                    className="flex min-w-0 flex-wrap items-center justify-between gap-4 p-4 rounded-xl border border-border/50 bg-secondary/10"
                                >
                                    <div className="flex min-w-0 items-center gap-3">
                                        <div className="w-10 h-10 shrink-0 rounded-lg bg-background flex items-center justify-center">
                                            <Blocks className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
                                        </div>
                                        <div className="min-w-0 space-y-1">
                                            <p className="truncate font-medium text-sm">
                                                {app.name}
                                                {app.publisher ? (
                                                    <span className="ml-2 font-mono text-xs font-normal text-muted-foreground">
                                                        {app.publisher}
                                                    </span>
                                                ) : null}
                                            </p>
                                            {app.scopes.length > 0 ? (
                                                <ul className="flex flex-wrap gap-1" aria-label={`Access granted to ${app.name}`}>
                                                    {app.scopes.map((scope) => (
                                                        <li
                                                            key={scope.key}
                                                            className="text-xs px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium"
                                                        >
                                                            {scope.label}
                                                        </li>
                                                    ))}
                                                </ul>
                                            ) : null}
                                            <p className="text-xs text-muted-foreground">
                                                Connected {formatRelativeTime(app.connectedAt)} · Last active{" "}
                                                {formatRelativeTime(app.lastActiveAt)}
                                            </p>
                                        </div>
                                    </div>
                                    <Button
                                        variant="outline"
                                        size="sm"
                                        className="shrink-0 hover:text-destructive"
                                        aria-label={`Revoke access for ${app.name}`}
                                        onClick={() => setPendingRevoke(app)}
                                        disabled={revokingId !== null}
                                    >
                                        {isRevoking ? (
                                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                                        ) : (
                                            <Unplug className="h-4 w-4" aria-hidden="true" />
                                        )}
                                        Revoke
                                    </Button>
                                </li>
                            )
                        })}
                    </ul>
                )}
            </CardContent>

            <AlertDialog
                open={pendingRevoke !== null}
                onOpenChange={(open) => {
                    if (!open && revokingId === null) setPendingRevoke(null)
                }}
            >
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Revoke access for {pendingRevoke?.name}?</AlertDialogTitle>
                        <AlertDialogDescription>
                            The app is signed out of your anon.li account immediately and can no longer
                            use your aliases, drops, or forms. To use it again, you&apos;ll need to
                            reconnect and approve it.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={revokingId !== null}>Cancel</AlertDialogCancel>
                        <Button variant="destructive" onClick={handleRevoke} disabled={revokingId !== null}>
                            {revokingId !== null && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                            {revokingId !== null ? "Revoking..." : "Revoke access"}
                        </Button>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </Card>
    )
}
