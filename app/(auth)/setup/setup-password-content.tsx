"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { ArrowLeft, Lock, ShieldCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { Icons } from "@/components/shared/icons"
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

export function SetupPasswordPageContent({ callbackUrl }: SetupPasswordPageContentProps) {
    const router = useRouter()
    const [support] = React.useState<VaultStorageSupport>(() => getVaultStorageSupport())
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [password, setPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [isPasswordFocused, setIsPasswordFocused] = React.useState(false)
    const [trustBrowser, setTrustBrowser] = React.useState(() => support.trustedBrowser)
    const [error, setError] = React.useState<string | null>(null)

    const showConfirmPassword = isPasswordFocused || password.length > 0

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

    return (
        <div className="flex min-h-svh flex-col items-center justify-center px-4 py-24">
            <div className="w-full max-w-md">
                <Card className="rounded-3xl border-border/50 shadow-sm">
                    <CardHeader className="space-y-4 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                            <Lock className="h-6 w-6 text-primary" />
                        </div>
                        <div className="space-y-1">
                            <CardTitle className="text-2xl font-bold font-serif">Set your vault password</CardTitle>
                            <CardDescription>
                                Create the password that will unlock your encrypted vault on this account.
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                        <form onSubmit={onSubmit} className="space-y-5">
                            <div className="space-y-2">
                                <Label htmlFor="password">Vault password</Label>
                                <Input
                                    id="password"
                                    type="password"
                                    value={password}
                                    placeholder="****************"
                                    onChange={(event) => setPassword(event.target.value)}
                                    onFocus={() => setIsPasswordFocused(true)}
                                    onBlur={() => setIsPasswordFocused(false)}
                                    autoComplete="new-password"
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
                                ) : (
                                    "Set vault password"
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
