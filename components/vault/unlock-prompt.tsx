"use client"

import * as React from "react"
import Link from "next/link"
import { Lock, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { useVault } from "@/components/vault/vault-provider"
import { getVaultStorageSupport, type VaultStorageSupport } from "@/lib/vault/storage-support"
import { cn } from "@/lib/utils"
import { Icons } from "@/components/shared/icons"

const subscribeStorageSupport = () => () => {}
let cachedStorageSupport: VaultStorageSupport | null = null
const getClientStorageSupport = (): VaultStorageSupport => {
    if (!cachedStorageSupport) cachedStorageSupport = getVaultStorageSupport()
    return cachedStorageSupport
}
const getServerStorageSupport = (): VaultStorageSupport | null => null

export function UnlockPrompt() {
    const { status, error, unlockWithPassword } = useVault()
    const [password, setPassword] = React.useState("")
    const [trustBrowserOverride, setTrustBrowserOverride] = React.useState<boolean | null>(null)
    const support = React.useSyncExternalStore(
        subscribeStorageSupport,
        getClientStorageSupport,
        getServerStorageSupport,
    )

    const trustBrowser = trustBrowserOverride ?? (support?.trustedBrowser ?? true)
    const setTrustBrowser = (next: boolean) => setTrustBrowserOverride(next)

    const isUnlocking = status === "unlocking"
    const isUnlocked = status === "unlocked"
    const hasIncorrectPassword = error === "Incorrect password"
    const iconState = isUnlocked ? "success" : hasIncorrectPassword ? "error" : "idle"

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!password || isUnlocked) return

        try {
            await unlockWithPassword(password, { trustBrowser })
            setPassword("")
        } catch {
            // Error state is handled by the provider.
        }
    }

    const title = isUnlocked ? "Vault unlocked" : "Unlock your vault"
    const description = isUnlocked
        ? "Password verified. Opening your encrypted workspace now."
        : "Most of your data stays encrypted until you unlock it with your password."

    return (
        <div className="flex min-h-[60vh] items-center justify-center px-4 py-10">
            <Card className="w-full max-w-md overflow-hidden rounded-[2rem] border-border/60 bg-card/95 shadow-lg backdrop-blur">
                <CardHeader className="space-y-4 border-b border-border/50 bg-muted/20 text-center">
                    <div
                        data-state={iconState}
                        className={cn(
                            "mx-auto flex h-16 w-16 items-center justify-center rounded-2xl transition-all duration-300",
                            isUnlocking && "bg-primary/10 ring-2 ring-primary/10",
                            hasIncorrectPassword && "bg-destructive/10 text-destructive ring-2 ring-destructive/20",
                            isUnlocked && "bg-emerald-500/10 text-emerald-600 ring-2 ring-emerald-500/20 dark:text-emerald-400",
                            !isUnlocking && !hasIncorrectPassword && !isUnlocked && "bg-primary/10 text-primary",
                        )}
                    >
                        {isUnlocking ? (
                            <Icons.spinner className="h-6 w-6 animate-spin text-primary" />
                        ) : (
                            <Lock className="h-6 w-6" />
                        )}
                    </div>
                    <div className="space-y-2">
                        <CardTitle className="text-2xl font-serif">{title}</CardTitle>
                        <CardDescription className="mx-auto max-w-sm">
                            {description}
                        </CardDescription>
                    </div>
                </CardHeader>
                <CardContent>
                    <form onSubmit={onSubmit} className="space-y-5 pt-4">
                        <div className="space-y-2">
                            <Input
                                id="vault-password"
                                type="password"
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                disabled={isUnlocking || isUnlocked}
                                placeholder="****************"
                                className={cn(
                                    "h-11 rounded-xl transition-colors duration-200",
                                    hasIncorrectPassword && "border-destructive text-destructive focus-visible:ring-destructive",
                                    isUnlocked && "border-emerald-500 text-emerald-600 focus-visible:ring-emerald-500 dark:text-emerald-400",
                                )}
                            />
                        </div>

                        <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/50 bg-muted/30 p-4">
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 font-medium">
                                    <ShieldCheck className="h-4 w-4 text-primary" />
                                    Trust this browser
                                </div>
                                <p className="text-sm text-muted-foreground">
                                    Keep the vault unlocked locally on this browser across tabs and refreshes for up to 30 days.
                                </p>
                                {support && !support.trustedBrowser && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                        Persistent unlock is unavailable because this browser is blocking secure local storage APIs.
                                    </p>
                                )}
                            </div>
                            <Switch
                                checked={trustBrowser}
                                onCheckedChange={setTrustBrowser}
                                disabled={isUnlocking || isUnlocked || !support?.trustedBrowser}
                                aria-label="Trust this browser"
                            />
                        </div>

                        {error && (
                            <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                {error}
                            </div>
                        )}

                        <div className="space-y-3">
                            <Button
                                type="submit"
                                className={cn(
                                    "h-11 w-full transition-colors duration-200",
                                    isUnlocked && "bg-emerald-600 hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-500",
                                )}
                                disabled={isUnlocking || isUnlocked || password.length === 0}
                            >
                                {isUnlocking ? (
                                    <>
                                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                        Unlocking...
                                    </>
                                ) : isUnlocked ? (
                                    <>
                                        <Lock className="mr-2 h-4 w-4" />
                                        Unlocked
                                    </>
                                ) : (
                                    "Unlock"
                                )}
                            </Button>
                            <div className="text-center space-y-1">
                                <Link href="/reset" className="text-sm font-medium text-primary hover:underline">
                                    Forgot password?
                                </Link>
                            </div>
                        </div>
                    </form>
                </CardContent>
            </Card>
        </div>
    )
}
