"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { requestPasswordResetAction } from "@/actions/session"
import { Button } from "@/components/ui/button"
import { IconInput } from "@/components/ui/icon-input"
import { Label } from "@/components/ui/label"
import { Turnstile } from "@/components/ui/turnstile"
import { Icons } from "@/components/shared/icons"
import { VaultAuthShell, type VaultAuthTone } from "@/components/vault/vault-auth-shell"
import { VaultPasswordInput } from "@/components/vault/vault-password-input"
import { AlertCircle, AlertTriangle, CheckCircle2, ArrowLeft, KeyRound, Mail } from "lucide-react"

const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

function ErrorBanner({ message }: { message: string }) {
    return (
        <div className="flex items-start gap-2 rounded-xl border border-destructive/20 bg-destructive/10 px-3.5 py-2.5 text-sm text-destructive duration-200 animate-in fade-in slide-in-from-top-1">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
            <span>{message}</span>
        </div>
    )
}

export function ResetPasswordContent() {
    const searchParams = useSearchParams()
    const token = searchParams.get("token")
    const [email, setEmail] = React.useState("")
    const [password, setPassword] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [isSubmitting, setIsSubmitting] = React.useState(false)
    const [success, setSuccess] = React.useState(false)
    const [requestSent, setRequestSent] = React.useState(false)
    const [error, setError] = React.useState<string | null>(null)
    const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null)
    const [turnstileRequested, setTurnstileRequested] = React.useState(false)
    const [turnstileRenderKey, setTurnstileRenderKey] = React.useState(0)

    const resetTurnstile = React.useCallback(() => {
        setTurnstileToken(null)
        setTurnstileRenderKey((key) => key + 1)
    }, [])

    const submitResetRequest = async (verifiedTurnstileToken?: string) => {
        const normalizedEmail = email.trim()
        if (!normalizedEmail) {
            setError("Enter your email address")
            return
        }

        const tokenForSubmit = verifiedTurnstileToken ?? turnstileToken
        if (turnstileSiteKey && !tokenForSubmit) {
            setTurnstileRequested(true)
            setError(null)
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const result = turnstileSiteKey
                ? await requestPasswordResetAction(normalizedEmail, tokenForSubmit!)
                : await requestPasswordResetAction(normalizedEmail)
            if (result.error) {
                throw new Error(result.error)
            }

            setRequestSent(true)
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Password reset request failed")
            resetTurnstile()
        } finally {
            setIsSubmitting(false)
        }
    }

    const handleTurnstileVerify = (token: string) => {
        setTurnstileToken(token)
        setTurnstileRequested(false)
        void submitResetRequest(token)
    }

    const onRequestReset = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        void submitResetRequest()
    }

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        if (!token) {
            setError("This reset link is invalid or expired")
            return
        }

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
            const result = await authClient.resetPassword({
                token,
                newPassword: password,
            })

            if (result.error) {
                throw new Error(result.error.message || "Password reset failed")
            }

            setSuccess(true)
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Password reset failed")
        } finally {
            setIsSubmitting(false)
        }
    }

    const returnHome = (
        <div className="mt-6 flex w-full items-center justify-center">
            <Link
                href="/"
                className="inline-flex items-center gap-1.5 text-sm text-muted-foreground underline-offset-4 transition-colors hover:text-foreground hover:underline"
            >
                <ArrowLeft className="h-4 w-4" />
                Return home
            </Link>
        </div>
    )

    // Resolve the screen's tone, emblem, and copy from the current state.
    let tone: VaultAuthTone = "neutral"
    let icon = <KeyRound className="h-6 w-6" />
    let title = "Reset your password"
    let description: React.ReactNode = "Enter your email and we will send you a secure reset link."
    let body: React.ReactNode

    if (!token) {
        if (requestSent) {
            tone = "success"
            icon = <CheckCircle2 className="h-6 w-6" />
            title = "Check your inbox"
            description = "We sent a secure reset link if this email exists."
            body = (
                <div className="mt-7 w-full space-y-4">
                    <div className="rounded-xl border border-success/20 bg-success/5 px-3.5 py-3 text-sm text-muted-foreground">
                        Open the reset link from your inbox to choose a new vault password.
                    </div>
                    <Button asChild size="lg" className="h-12 w-full rounded-xl text-sm font-medium">
                        <Link href="/login">Return to login</Link>
                    </Button>
                </div>
            )
        } else {
            body = (
                <form onSubmit={onRequestReset} className="mt-7 w-full space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-xs font-medium text-muted-foreground">
                            Email address
                        </Label>
                        <IconInput
                            icon={Mail}
                            id="email"
                            type="email"
                            value={email}
                            onChange={(event) => setEmail(event.target.value)}
                            autoComplete="email"
                            className="h-12 rounded-xl text-base transition-colors duration-200 md:text-sm"
                            placeholder="joe.doe@anon.li"
                            disabled={isSubmitting}
                            required
                        />
                    </div>

                    {error && <ErrorBanner message={error} />}

                    {turnstileSiteKey && turnstileRequested && (
                        <Turnstile
                            key={turnstileRenderKey}
                            siteKey={turnstileSiteKey}
                            onVerify={handleTurnstileVerify}
                            onError={resetTurnstile}
                            onExpire={() => setTurnstileToken(null)}
                        />
                    )}

                    <Button
                        type="submit"
                        size="lg"
                        className="h-12 w-full rounded-xl text-sm font-medium"
                        disabled={isSubmitting || (!!turnstileSiteKey && turnstileRequested && !turnstileToken)}
                    >
                        {isSubmitting ? (
                            <>
                                <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                Sending…
                            </>
                        ) : (
                            "Send reset link"
                        )}
                    </Button>
                </form>
            )
        }
    } else if (success) {
        tone = "success"
        icon = <CheckCircle2 className="h-6 w-6" />
        title = "Password reset"
        description = "Sign in again to rebuild your encrypted vault."
        body = (
            <div className="mt-7 w-full space-y-4">
                <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3.5 py-3 text-sm text-muted-foreground">
                    Your password was reset successfully. All previous vault encryption data has been cleared — sign in
                    to set up a new encrypted vault.
                </div>
                <Button asChild size="lg" className="h-12 w-full rounded-xl text-sm font-medium">
                    <Link href="/login">Return to login</Link>
                </Button>
            </div>
        )
    } else {
        tone = "warning"
        icon = <AlertTriangle className="h-6 w-6" />
        description = "Choose a new password for your account."
        body = (
            <>
                <div className="mt-7 flex w-full items-start gap-3 rounded-xl border border-warning/30 bg-warning/5 p-4 text-left">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
                    <div className="space-y-1 text-sm">
                        <p className="font-medium text-warning">
                            Your encrypted vault will be destroyed
                        </p>
                        <p className="text-muted-foreground">
                            Resetting your password makes previously encrypted data permanently inaccessible. After
                            signing back in, you will need to create a new vault.
                        </p>
                    </div>
                </div>

                <form onSubmit={onSubmit} className="mt-4 w-full space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="password" className="text-xs font-medium text-muted-foreground">
                            New password
                        </Label>
                        <VaultPasswordInput
                            id="password"
                            value={password}
                            onChange={(event) => setPassword(event.target.value)}
                            autoComplete="new-password"
                            placeholder="At least 12 characters"
                            disabled={isSubmitting}
                            required
                        />
                    </div>
                    <div className="space-y-2">
                        <Label htmlFor="confirmPassword" className="text-xs font-medium text-muted-foreground">
                            Confirm password
                        </Label>
                        <VaultPasswordInput
                            id="confirmPassword"
                            value={confirmPassword}
                            onChange={(event) => setConfirmPassword(event.target.value)}
                            autoComplete="new-password"
                            placeholder="Re-enter your password"
                            disabled={isSubmitting}
                            invalid={confirmPassword.length > 0 && password !== confirmPassword}
                            required
                        />
                    </div>

                    {error && <ErrorBanner message={error} />}

                    <Button type="submit" size="lg" className="h-12 w-full rounded-xl text-sm font-medium" disabled={isSubmitting}>
                        {isSubmitting ? (
                            <>
                                <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                                Saving…
                            </>
                        ) : (
                            "Reset password"
                        )}
                    </Button>
                </form>
            </>
        )
    }

    return (
        <VaultAuthShell tone={tone} pulse={isSubmitting} icon={icon} title={title} description={description} below={returnHome}>
            {body}
        </VaultAuthShell>
    )
}
