"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { AlertCircle, ArrowLeft, Check, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Icons } from "@/components/shared/icons"
import { VaultAuthShell } from "@/components/vault/vault-auth-shell"
import { VaultPasswordInput } from "@/components/vault/vault-password-input"
import { TrustBrowserToggle } from "@/components/vault/trust-browser-toggle"
import { cn } from "@/lib/utils"
import { broadcastVaultMessage } from "@/lib/vault/sync"
import { persistTrustedBrowser, readVaultApiData } from "@/lib/vault/client"
import {
    arrayBufferToBase64Url,
    deriveAuthSecret,
    derivePasswordKEK,
    generateSalt,
    generateVaultKey,
    wrapVaultKey,
} from "@/lib/vault/crypto"
import { setVaultRuntime } from "@/lib/vault/runtime"
import { getVaultStorageSupport, type VaultStorageSupport } from "@/lib/vault/storage-support"

interface SetupPasswordPageContentProps {
    callbackUrl: string
}

// Storage support depends on browser-only APIs, so it must not be read during
// the initial render — doing so makes the server (no `window`) and client HTML
// diverge and triggers a hydration mismatch. Resolve it post-hydration via
// useSyncExternalStore, mirroring the unlock screen.
const subscribeStorageSupport = () => () => {}
let cachedStorageSupport: VaultStorageSupport | null = null
const getClientStorageSupport = (): VaultStorageSupport => {
    if (!cachedStorageSupport) cachedStorageSupport = getVaultStorageSupport()
    return cachedStorageSupport
}
const getServerStorageSupport = (): VaultStorageSupport | null => null

export function SetupPasswordPageContent({ callbackUrl }: SetupPasswordPageContentProps) {
    const router = useRouter()
    const support = React.useSyncExternalStore(
        subscribeStorageSupport,
        getClientStorageSupport,
        getServerStorageSupport,
    )
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [password, setPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [isPasswordFocused, setIsPasswordFocused] = React.useState(false)
    const [trustBrowserOverride, setTrustBrowserOverride] = React.useState<boolean | null>(null)
    const [error, setError] = React.useState<string | null>(null)

    const trustBrowser = trustBrowserOverride ?? (support?.trustedBrowser ?? true)
    const setTrustBrowser = (next: boolean) => setTrustBrowserOverride(next)

    const showConfirmPassword = isPasswordFocused || password.length > 0
    const meetsLength = password.length >= 12
    const matches = confirmPassword.length > 0 && password === confirmPassword

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        if (password.length < 12) {
            setError("Password must be at least 12 characters")
            return
        }

        if (password !== confirmPassword) {
            setError("Passwords do not match")
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const authSalt = arrayBufferToBase64Url(generateSalt())
            const vaultSalt = arrayBufferToBase64Url(generateSalt())
            const authSecret = arrayBufferToBase64Url(await deriveAuthSecret(password, authSalt))
            const passwordKey = await derivePasswordKEK(password, vaultSalt)
            const vaultKey = await generateVaultKey()
            const passwordWrappedVaultKey = arrayBufferToBase64Url(await wrapVaultKey(vaultKey, passwordKey))

            const result = await readVaultApiData<{ vaultGeneration: number; vaultId: string }>("/api/vault/setup", {
                method: "POST",
                body: JSON.stringify({
                    authSecret,
                    authSalt,
                    vaultSalt,
                    passwordWrappedVaultKey,
                }),
            })

            const gen = result.vaultGeneration
            const vaultId = result.vaultId
            setVaultRuntime(vaultKey, gen, vaultId)

            if (trustBrowser && support?.trustedBrowser) {
                await persistTrustedBrowser(vaultKey, gen, vaultId)
            }

            broadcastVaultMessage({
                type: "VAULT_UNLOCKED",
                vaultGeneration: gen,
                vaultId,
                timestamp: Date.now(),
                source: "setup-password",
            })

            router.push(callbackUrl)
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Vault setup failed")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <VaultAuthShell
            icon={<Lock className="h-6 w-6" />}
            pulse={isSubmitting}
            title="Set your vault password"
            description="Create the password that unlocks your encrypted vault on this account."
            below={
                <div className="mt-6 flex w-full items-center justify-center">
                    <Link
                        href="/"
                        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
                    >
                        <ArrowLeft className="h-4 w-4" />
                        Return home
                    </Link>
                </div>
            }
        >
            <form onSubmit={onSubmit} className="mt-7 w-full space-y-4">
                <div className="space-y-2">
                    <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                        Vault password
                    </Label>
                    <VaultPasswordInput
                        id="password"
                        value={password}
                        placeholder="At least 12 characters"
                        onChange={(event) => setPassword(event.target.value)}
                        onFocus={() => setIsPasswordFocused(true)}
                        onBlur={() => setIsPasswordFocused(false)}
                        autoComplete="new-password"
                        disabled={isSubmitting}
                        valid={meetsLength && matches}
                        required
                    />
                </div>

                {showConfirmPassword && (
                    <div className="space-y-2 duration-200 animate-in fade-in slide-in-from-top-1">
                        <Label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground">
                            Confirm password
                        </Label>
                        <VaultPasswordInput
                            id="confirmPassword"
                            value={confirmPassword}
                            placeholder="Re-enter your password"
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            disabled={isSubmitting}
                            invalid={confirmPassword.length > 0 && !matches}
                            valid={meetsLength && matches}
                            required
                        />
                    </div>
                )}

                {(isPasswordFocused || password.length > 0) && (
                    <ul className="space-y-1.5 duration-200 animate-in fade-in slide-in-from-top-1">
                        <PasswordRequirement met={meetsLength}>At least 12 characters</PasswordRequirement>
                        <PasswordRequirement met={matches}>Passwords match</PasswordRequirement>
                    </ul>
                )}

                <TrustBrowserToggle
                    id="setup-trust-browser"
                    checked={trustBrowser}
                    onCheckedChange={setTrustBrowser}
                    available={support?.trustedBrowser ?? true}
                    disabled={isSubmitting}
                />

                {error && (
                    <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive duration-200 animate-in fade-in slide-in-from-top-1">
                        <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                        <span>{error}</span>
                    </div>
                )}

                <Button
                    type="submit"
                    size="lg"
                    className="h-12 w-full rounded-xl text-sm font-medium"
                    disabled={isSubmitting}
                >
                    {isSubmitting ? (
                        <>
                            <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                            Saving…
                        </>
                    ) : (
                        "Set vault password"
                    )}
                </Button>
            </form>
        </VaultAuthShell>
    )
}

function PasswordRequirement({ met, children }: { met: boolean; children: React.ReactNode }) {
    return (
        <li
            className={cn(
                "flex items-center gap-2 text-xs transition-colors",
                met ? "text-success" : "text-muted-foreground",
            )}
        >
            <Check className={cn("h-3.5 w-3.5 shrink-0 transition-opacity", met ? "opacity-100" : "opacity-30")} />
            {children}
        </li>
    )
}
