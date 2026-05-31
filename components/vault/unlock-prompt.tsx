"use client"

import * as React from "react"
import Link from "next/link"
import { Eye, EyeOff, Lock, LockKeyhole, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
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
    const [showPassword, setShowPassword] = React.useState(false)
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
        ? "Password verified — opening your encrypted vault."
        : "Your data stays encrypted until you unlock it with your password."

    return (
        <div className="relative flex min-h-[70vh] items-center justify-center overflow-hidden px-4 py-12">
            {/* Ambient backdrop */}
            <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <div className="absolute left-1/2 top-1/2 h-[32rem] w-[32rem] -translate-x-1/2 -translate-y-1/2 rounded-full bg-foreground/[0.04] blur-3xl dark:bg-foreground/[0.06]" />
                <div className="absolute inset-0 bg-grid-white opacity-40 dark:opacity-100 [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]" />
            </div>

            <Card className="w-full max-w-md overflow-hidden rounded-[1.75rem] border-border/60 bg-card/80 luxury-shadow-lg backdrop-blur-xl duration-500 animate-in fade-in zoom-in-95">
                <CardContent className="flex flex-col items-center px-7 pb-8 pt-9 sm:px-9">
                    {/* Lock emblem */}
                    <div className="relative mb-7 flex items-center justify-center">
                        <div
                            data-state={iconState}
                            className={cn(
                                "relative flex h-14 w-14 items-center justify-center rounded-2xl shadow-inner transition-all duration-500",
                                isUnlocking && "animate-pulse",
                                isUnlocked
                                    ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                    : hasIncorrectPassword
                                      ? "bg-destructive/10 text-destructive"
                                      : "bg-background text-foreground border border-border/70",
                            )}
                        >
                            {isUnlocking ? (
                                <Icons.spinner className="h-6 w-6 animate-spin" />
                            ) : isUnlocked ? (
                                <LockKeyhole className="h-6 w-6" />
                            ) : (
                                <Lock className="h-6 w-6" />
                            )}
                        </div>
                    </div>

                    <h1 className="text-center font-serif text-[1.7rem] leading-tight tracking-tight">
                        {title}
                    </h1>
                    <p className="mx-auto mt-2 max-w-xs text-center text-sm leading-relaxed text-muted-foreground">
                        {description}
                    </p>

                    <form onSubmit={onSubmit} className="mt-7 w-full space-y-4">
                        <div className="relative">
                            <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input
                                id="vault-password"
                                type={showPassword ? "text" : "password"}
                                autoComplete="current-password"
                                value={password}
                                onChange={(event) => setPassword(event.target.value)}
                                disabled={isUnlocking || isUnlocked}
                                placeholder="Enter your password"
                                className={cn(
                                    "h-12 rounded-xl pl-10 pr-11 text-base transition-colors duration-200 md:text-sm",
                                    hasIncorrectPassword &&
                                        "border-destructive text-destructive focus-visible:ring-destructive",
                                    isUnlocked &&
                                        "border-emerald-500 text-emerald-600 focus-visible:ring-emerald-500 dark:text-emerald-400",
                                )}
                            />
                            <button
                                type="button"
                                onClick={() => setShowPassword((prev) => !prev)}
                                disabled={isUnlocking || isUnlocked}
                                tabIndex={-1}
                                aria-label={showPassword ? "Hide password" : "Show password"}
                                className="absolute right-1 top-1/2 flex h-9 w-9 -translate-y-1/2 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:text-foreground disabled:opacity-50"
                            >
                                {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                        </div>

                        {error && (
                            <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive duration-200 animate-in fade-in slide-in-from-top-1">
                                <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
                                <span>{error}</span>
                            </div>
                        )}

                        <label
                            htmlFor="trust-browser"
                            className={cn(
                                "flex cursor-pointer items-start justify-between gap-4 rounded-xl border border-border/60 bg-muted/30 p-4 transition-colors hover:bg-muted/50",
                                (isUnlocking || isUnlocked || !support?.trustedBrowser) &&
                                    "cursor-default opacity-70 hover:bg-muted/30",
                            )}
                        >
                            <div className="space-y-1">
                                <div className="flex items-center gap-2 text-sm font-medium">
                                    <ShieldCheck className="h-4 w-4 text-foreground/70" />
                                    Trust this browser
                                </div>
                                <p className="text-xs leading-relaxed text-muted-foreground">
                                    Stay unlocked on this browser across tabs and refreshes for up to 30 days.
                                </p>
                                {support && !support.trustedBrowser && (
                                    <p className="text-xs text-amber-600 dark:text-amber-400">
                                        Unavailable — this browser is blocking secure local storage.
                                    </p>
                                )}
                            </div>
                            <Switch
                                id="trust-browser"
                                checked={trustBrowser}
                                onCheckedChange={setTrustBrowser}
                                disabled={isUnlocking || isUnlocked || !support?.trustedBrowser}
                                aria-label="Trust this browser"
                            />
                        </label>

                        <Button
                            type="submit"
                            size="lg"
                            className={cn(
                                "h-12 w-full rounded-xl text-sm font-medium transition-colors duration-200",
                                isUnlocked &&
                                    "bg-emerald-600 hover:bg-emerald-600 dark:bg-emerald-500 dark:hover:bg-emerald-500",
                            )}
                            disabled={isUnlocking || isUnlocked || password.length === 0}
                        >
                            {isUnlocking ? (
                                <>
                                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                    Unlocking…
                                </>
                            ) : isUnlocked ? (
                                <>
                                    <LockKeyhole className="mr-2 h-4 w-4" />
                                    Unlocked
                                </>
                            ) : (
                                "Unlock vault"
                            )}
                        </Button>
                    </form>

                    <div className="mt-6 flex w-full items-center justify-center">
                        <Link
                            href="/reset"
                            className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                        >
                            Forgot your password?
                        </Link>
                    </div>
                </CardContent>

                <div className="border-t border-border/50 bg-muted/20 px-7 py-3.5 sm:px-9">
                    <p className="flex items-center justify-center gap-1.5 text-xs text-muted-foreground">
                        <ShieldCheck className="h-3.5 w-3.5" />
                        End-to-end encrypted · Zero-knowledge
                    </p>
                </div>
            </Card>
        </div>
    )
}
