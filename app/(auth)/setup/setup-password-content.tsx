"use client"

import * as React from "react"
import { useRouter, useSearchParams } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Icons } from "@/components/shared/icons"
import { broadcastVaultMessage } from "@/lib/vault/sync"
import { persistTrustedBrowser, readVaultApiData } from "@/lib/vault/client"
import { sanitizeAuthCallbackUrl } from "@/lib/safe-callback-url"
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

interface MigrationStatus {
    vaultAvailable: boolean
    needsPassword: boolean
    hasPassword: boolean
    hasVault: boolean
}

export function SetupPasswordPageContent() {
    const router = useRouter()
    const searchParams = useSearchParams()
    const { data: session, isPending } = authClient.useSession()
    const [support] = React.useState<VaultStorageSupport>(() => getVaultStorageSupport())
    const [migrationStatus, setMigrationStatus] = React.useState<MigrationStatus | null>(null)
    const [isLoading, setIsLoading] = React.useState(true)
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [password, setPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [isPasswordFocused, setIsPasswordFocused] = React.useState(false)
    const [trustBrowser, setTrustBrowser] = React.useState(() => support.trustedBrowser)
    const [error, setError] = React.useState<string | null>(null)

    const callbackUrl = sanitizeAuthCallbackUrl(searchParams.get("callbackUrl"))

    React.useEffect(() => {
        if (isPending) return
        if (!session?.user?.id) {
            router.replace("/login")
            return
        }

        let cancelled = false

        void (async () => {
            try {
                const status = await readVaultApiData<MigrationStatus>("/api/vault/migration-status")
                if (cancelled) return

                if (!status.vaultAvailable) {
                    router.replace(callbackUrl)
                    return
                }

                if (status.hasVault) {
                    router.replace(callbackUrl)
                    return
                }

                setMigrationStatus(status)
                setError(null)
            } catch (loadError) {
                if (!cancelled) {
                    setError(loadError instanceof Error ? loadError.message : "Failed to load migration status")
                }
            } finally {
                if (!cancelled) {
                    setIsLoading(false)
                }
            }
        })()

        return () => {
            cancelled = true
        }
    }, [callbackUrl, isPending, router, session?.user?.id])

    const needsPassword = migrationStatus?.needsPassword ?? false
    const showConfirmPassword = needsPassword && (isPasswordFocused || password.length > 0)
    const title = needsPassword ? "Set your vault password" : "Finish vault setup"
    const description = needsPassword
        ? "Create the password that will unlock your encrypted vault on this account."
        : "Confirm your current password to upgrade this account into a fully encrypted vault."

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        if (!migrationStatus) return

        if (password.length < 12) {
            setError("Password must be at least 12 characters")
            return
        }

        if (needsPassword && password !== confirmPassword) {
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
                    ...(!needsPassword && { currentPassword: password }),
                    authSecret,
                    authSalt,
                    vaultSalt,
                    passwordWrappedVaultKey,
                }),
            })

            const gen = result.vaultGeneration
            const vaultId = result.vaultId
            setVaultRuntime(vaultKey, gen, vaultId)

            if (trustBrowser && support.trustedBrowser) {
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

    if (isLoading || isPending) {
        return (
            <div className="flex min-h-svh items-center justify-center px-4 py-24">
                <Icons.spinner className="h-8 w-8 animate-spin text-primary" />
            </div>
        )
    }

    return (
        <div className="flex min-h-svh flex-col items-center justify-center px-4 py-24">
            <div className="w-full max-w-md">
                <Card className="rounded-3xl border-border/50 shadow-sm">
                    <CardHeader className="space-y-4 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                            <Lock className="h-6 w-6 text-primary" />
                        </div>
                        <div className="space-y-1">
                            <CardTitle className="text-2xl font-bold font-serif">{title}</CardTitle>
                            <CardDescription>{description}</CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={onSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="password">
                                    {needsPassword ? "Vault password" : "Current password"}
                                </Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    placeholder="****************"
                                    onChange={(event) => setPassword(event.target.value)}
                                    onFocus={() => setIsPasswordFocused(true)}
                                    onBlur={() => setIsPasswordFocused(false)}
                                    autoComplete={needsPassword ? "new-password" : "current-password"}
                                    className="h-12 px-4 py-0 leading-none"
                                    disabled={isSubmitting}
                                    required
                                />
                            </div>

                            {showConfirmPassword && (
                                <div className="space-y-2">
                                    <Label htmlFor="confirmPassword">Confirm password</Label>
                                    <Input
                                        id="confirmPassword"
                                        type="password"
                                        value={confirmPassword}
                                        placeholder="****************"
                                        onChange={(event) => setConfirmPassword(event.target.value)}
                                        autoComplete="new-password"
                                        className="h-12 px-4 py-0 leading-none"
                                        disabled={isSubmitting}
                                        required
                                    />
                                </div>
                            )}

                            <div className="flex items-start justify-between gap-4 rounded-2xl border border-border/50 bg-muted/30 p-4">
                                <div className="space-y-1">
                                    <div className="flex items-center gap-2 font-medium">
                                        <ShieldCheck className="h-4 w-4 text-primary" />
                                        Trust this browser
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                        Keep this vault available only on this browser across refreshes and new tabs for up to 30 days.
                                    </p>
                                    {!support.trustedBrowser && (
                                        <p className="text-xs text-amber-600 dark:text-amber-400">
                                            Persistent unlock is unavailable because this browser is blocking secure local storage APIs.
                                        </p>
                                    )}
                                </div>
                                <Switch
                                    checked={trustBrowser}
                                    onCheckedChange={setTrustBrowser}
                                    disabled={isSubmitting || !support.trustedBrowser}
                                    aria-label="Trust this browser"
                                />
                            </div>

                            {error && (
                                <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                                    {error}
                                </div>
                            )}

                            <Button type="submit" className="w-full" disabled={isSubmitting}>
                                {isSubmitting ? (
                                    <>
                                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                        Saving...
                                    </>
                                ) : needsPassword ? (
                                    "Set vault password"
                                ) : (
                                    "Finish vault setup"
                                )}
                            </Button>
                        </form>

                        <div className="mt-4 text-center text-sm text-muted-foreground">
                            <Link href="/" className="inline-flex items-center gap-2 text-primary hover:underline">
                                <ArrowLeft className="h-4 w-4" />
                                Return home
                            </Link>
                        </div>
                    </CardContent>
                </Card>
            </div>
        </div>
    )
}
