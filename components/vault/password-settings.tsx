"use client"

import * as React from "react"
import { toast } from "sonner"
import { ArrowLeft, KeyRound } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { useVault } from "@/components/vault/vault-provider"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { clearTrustedBrowserState } from "@/lib/vault/trusted-browser"
import { broadcastVaultMessage } from "@/lib/vault/sync"
import { readVaultApiData } from "@/lib/vault/client"
import {
    base64UrlToArrayBuffer,
    arrayBufferToBase64Url,
    deriveAuthSecret,
    derivePasswordKEK,
    generateSalt,
    unwrapVaultKey,
    wrapVaultKey,
} from "@/lib/vault/crypto"

export function PasswordSettings() {
    const { data: session } = authClient.useSession()
    const { getVaultKey, unlockWithPassword } = useVault()
    const [currentPassword, setCurrentPassword] = React.useState("")
    const [newPassword, setNewPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [step, setStep] = React.useState<1 | 2>(1)

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        if (step === 1) {
            if (!currentPassword) {
                toast.error("Enter your current password")
                return
            }

            setIsSubmitting(true)
            try {
                const materials = await readVaultApiData<{
                    vaultSalt: string
                    passwordWrappedVaultKey: string
                }>("/api/vault/unlock")

                const currentPasswordKey = await derivePasswordKEK(currentPassword, materials.vaultSalt)
                await unwrapVaultKey(
                    base64UrlToArrayBuffer(materials.passwordWrappedVaultKey),
                    currentPasswordKey,
                )

                setStep(2)
            } catch {
                toast.error("Current password is incorrect")
            } finally {
                setIsSubmitting(false)
            }

            return
        }

        if (!session?.user?.email) {
            toast.error("No active session found")
            return
        }

        const vaultKey = getVaultKey()
        if (!vaultKey) {
            toast.error("Unlock your vault before changing your password")
            return
        }

        if (newPassword.length < 12) {
            toast.error("New password must be at least 12 characters")
            return
        }

        if (newPassword !== confirmPassword) {
            toast.error("New passwords do not match")
            return
        }

        setIsSubmitting(true)

        try {
            const bootstrap = await readVaultApiData<{ authSalt: string }>("/api/vault/bootstrap", {
                method: "POST",
                body: JSON.stringify({ email: session.user.email }),
            })

            const currentAuthSecret = arrayBufferToBase64Url(await deriveAuthSecret(currentPassword, bootstrap.authSalt))
            const newAuthSalt = arrayBufferToBase64Url(generateSalt())
            const newVaultSalt = arrayBufferToBase64Url(generateSalt())
            const newAuthSecret = arrayBufferToBase64Url(await deriveAuthSecret(newPassword, newAuthSalt))
            const newPasswordKey = await derivePasswordKEK(newPassword, newVaultSalt)
            const newPasswordWrappedVaultKey = arrayBufferToBase64Url(await wrapVaultKey(vaultKey, newPasswordKey))

            const result = await readVaultApiData<{ vaultGeneration: number; vaultId: string }>("/api/vault/change-password", {
                method: "POST",
                body: JSON.stringify({
                    currentAuthSecret,
                    newAuthSecret,
                    newAuthSalt,
                    newVaultSalt,
                    newPasswordWrappedVaultKey,
                    revokeOtherSessions: true,
                }),
            })

            await clearTrustedBrowserState()
            broadcastVaultMessage({
                type: "VAULT_ROTATED",
                vaultGeneration: result.vaultGeneration,
                vaultId: result.vaultId,
                timestamp: Date.now(),
                source: "password-settings",
            })

            try {
                await unlockWithPassword(newPassword)
            } catch {
                toast.warning("Password changed but vault re-lock failed. Please unlock manually with your new password.")
            }

            setCurrentPassword("")
            setNewPassword("")
            setConfirmPassword("")
            setStep(1)
            toast.success("Password updated")
        } catch (error) {
            toast.error(error instanceof Error ? error.message : "Password change failed")
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Card className="rounded-3xl border-border/40 shadow-sm">
            <CardHeader className="p-8 pb-4">
                <CardTitle className="text-xl font-medium font-serif">Change password</CardTitle>
                <CardDescription>
                    Rotate the password that derives your sign-in secret and vault unlock key.
                </CardDescription>
            </CardHeader>
            <CardContent className="p-8 pt-4">
                <form onSubmit={onSubmit} className="grid gap-4">
                    {step === 1 && (
                        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                            <Input
                                id="current-password"
                                type="password"
                                value={currentPassword}
                                onChange={(event) => setCurrentPassword(event.target.value)}
                                autoComplete="current-password"
                                className="h-11 flex-1 px-4 py-0"
                                placeholder="Enter your current password"
                                disabled={isSubmitting}
                                required
                            />
                            <Button type="submit" className="h-11 sm:w-fit" disabled={isSubmitting || currentPassword.length === 0}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                {isSubmitting ? "Checking..." : "Next"}
                            </Button>
                        </div>
                    )}

                    {step === 2 && (
                        <>
                            <div className="space-y-2">
                                <Label htmlFor="new-password">New password</Label>
                                <Input
                                    id="new-password"
                                    type="password"
                                    value={newPassword}
                                    onChange={(event) => setNewPassword(event.target.value)}
                                    autoComplete="new-password"
                                    className="h-11 px-4 py-0"
                                    placeholder="Create a new password"
                                    disabled={isSubmitting}
                                    required
                                />
                            </div>
                            <div className="space-y-2">
                                <Label htmlFor="confirm-new-password">Confirm new password</Label>
                                <Input
                                    id="confirm-new-password"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    autoComplete="new-password"
                                    className="h-11 px-4 py-0"
                                    placeholder="Re-enter your new password"
                                    disabled={isSubmitting}
                                    required
                                />
                            </div>
                        </>
                    )}

                    {step === 2 && (
                        <div className="flex w-full justify-end gap-2">
                            <Button type="button" variant="outline" className="h-11" onClick={() => setStep(1)} disabled={isSubmitting}>
                                <ArrowLeft className="mr-2 h-4 w-4" />
                                Back
                            </Button>
                            <Button type="submit" className="h-11 w-full sm:w-fit" disabled={isSubmitting}>
                                <KeyRound className="mr-2 h-4 w-4" />
                                {isSubmitting ? "Updating..." : "Change password"}
                            </Button>
                        </div>
                    )}
                </form>
            </CardContent>
        </Card>
    )
}
