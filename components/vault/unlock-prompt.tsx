"use client"

import * as React from "react"
import Link from "next/link"
import { AlertCircle, Lock, LockKeyhole } from "lucide-react"
import { Button } from "@/components/ui/button"
import { useVault } from "@/components/vault/vault-provider"
import { VaultAuthShell } from "@/components/vault/vault-auth-shell"
import { VaultPasswordInput } from "@/components/vault/vault-password-input"
import { TrustBrowserToggle } from "@/components/vault/trust-browser-toggle"
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
    const tone = isUnlocked ? "success" : hasIncorrectPassword ? "error" : "neutral"

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

    return (
        <VaultAuthShell
            tone={tone}
            pulse={isUnlocking}
            icon={
                isUnlocking ? (
                    <Icons.spinner className="h-6 w-6 animate-spin" />
                ) : isUnlocked ? (
                    <LockKeyhole className="h-6 w-6" />
                ) : (
                    <Lock className="h-6 w-6" />
                )
            }
            title={isUnlocked ? "Vault unlocked" : "Unlock your vault"}
            description={
                isUnlocked
                    ? "Password verified — opening your encrypted vault."
                    : "Your data stays encrypted until you unlock it with your password."
            }
            below={
                <div className="mt-6 flex w-full items-center justify-center">
                    <Link
                        href="/reset"
                        className="text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                        Forgot your password?
                    </Link>
                </div>
            }
        >
            <form onSubmit={onSubmit} className="mt-7 w-full space-y-4">
                <VaultPasswordInput
                    id="vault-password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    disabled={isUnlocking || isUnlocked}
                    placeholder="Enter your password"
                    invalid={hasIncorrectPassword}
                    valid={isUnlocked}
                />

                {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive duration-200 animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <TrustBrowserToggle
                    checked={trustBrowser}
                    onCheckedChange={setTrustBrowser}
                    available={support?.trustedBrowser ?? true}
                    disabled={isUnlocking || isUnlocked}
                />

                <Button
                    type="submit"
                    size="lg"
                    className={cn(
                        "h-12 w-full rounded-xl text-sm font-medium transition-colors duration-200",
                        isUnlocked &&
                            "bg-success text-success-foreground hover:bg-success",
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
        </VaultAuthShell>
    )
}
