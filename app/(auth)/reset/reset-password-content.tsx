"use client"

import * as React from "react"
import Link from "next/link"
import { useSearchParams } from "next/navigation"
import { authClient } from "@/lib/auth-client"
import { requestPasswordResetAction } from "@/actions/session"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Icons } from "@/components/shared/icons"
import { AlertTriangle, CheckCircle2, ArrowLeft } from "lucide-react"

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

    const onRequestReset = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()

        const normalizedEmail = email.trim()
        if (!normalizedEmail) {
            setError("Enter your email address")
            return
        }

        setIsSubmitting(true)
        setError(null)

        try {
            const result = await requestPasswordResetAction(normalizedEmail)
            if (result.error) {
                throw new Error(result.error)
            }

            setRequestSent(true)
        } catch (submitError) {
            setError(submitError instanceof Error ? submitError.message : "Password reset request failed")
        } finally {
            setIsSubmitting(false)
        }
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

    if (!token) {
        return (
            <div className="flex min-h-svh flex-col items-center justify-center px-4 py-24">
                <div className="w-full max-w-md">
                    <Card className="rounded-3xl border-border/50 shadow-sm">
                        <CardHeader className="space-y-4 text-center">
                            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                                {requestSent ? (
                                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                                ) : (
                                    <AlertTriangle className="h-6 w-6 text-amber-500" />
                                )}
                            </div>
                            <div className="space-y-1">
                                <CardTitle className="text-2xl font-serif">
                                    {requestSent ? "Check your inbox" : "Reset your password"}
                                </CardTitle>
                                <CardDescription>
                                    {requestSent
                                        ? "We sent a secure reset link if this email exists."
                                        : "Enter your email and we will send you a secure reset link."}
                                </CardDescription>
                            </div>
                        </CardHeader>
                        <CardContent>
                            {!requestSent ? (
                                <form onSubmit={onRequestReset} className="space-y-5">
                                    <div className="space-y-2">
                                        <Label htmlFor="email">Email address</Label>
                                        <Input
                                            id="email"
                                            type="email"
                                            value={email}
                                            onChange={(event) => setEmail(event.target.value)}
                                            autoComplete="email"
                                            className="h-12 px-4 py-0 leading-none"
                                            placeholder="joe.doe@anon.li"
                                            disabled={isSubmitting}
                                            required
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
                                                Sending...
                                            </>
                                        ) : (
                                            "Send reset link"
                                        )}
                                    </Button>
                                </form>
                            ) : (
                                <div className="space-y-4">
                                    <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4 text-sm text-muted-foreground">
                                        Open the reset link from your inbox to choose a new vault password.
                                    </div>
                                    <Button asChild className="w-full">
                                        <Link href="/login">Return to login</Link>
                                    </Button>
                                </div>
                            )}

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

    return (
        <div className="flex min-h-svh flex-col items-center justify-center px-4 py-24">
            <div className="w-full max-w-md">
                <Card className="rounded-3xl border-border/50 shadow-sm">
                    <CardHeader className="space-y-4 text-center">
                        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10">
                            {success ? (
                                <CheckCircle2 className="h-6 w-6 text-green-500" />
                            ) : (
                                <AlertTriangle className="h-6 w-6 text-amber-500" />
                            )}
                        </div>
                        <div className="space-y-1">
                            <CardTitle className="text-2xl font-serif">
                                {success ? "Password reset" : "Reset your password"}
                            </CardTitle>
                            <CardDescription>
                                {success
                                    ? "Sign in again to rebuild your encrypted vault."
                                    : "Choose a new password for your account."}
                            </CardDescription>
                        </div>
                    </CardHeader>
                    <CardContent>
                        {!success ? (
                            <>
                                <div className="mb-5 flex items-start gap-3 rounded-2xl border border-amber-500/30 bg-amber-500/5 p-4">
                                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
                                    <div className="space-y-1 text-sm">
                                        <p className="font-medium text-amber-600 dark:text-amber-400">
                                            Your encrypted vault will be destroyed
                                        </p>
                                        <p className="text-muted-foreground">
                                            Resetting your password makes previously encrypted data permanently inaccessible. After signing back in, you will need to create a new vault.
                                        </p>
                                    </div>
                                </div>

                                <form onSubmit={onSubmit} className="space-y-5">
                                    <div className="space-y-2">
                                        <Label htmlFor="password">New password</Label>
                                        <Input
                                            id="password"
                                            type="password"
                                            value={password}
                                            onChange={(event) => setPassword(event.target.value)}
                                            autoComplete="new-password"
                                            className="h-12 px-4 py-0 leading-none"
                                            placeholder="****************"
                                            disabled={isSubmitting}
                                            required
                                        />
                                    </div>
                                    <div className="space-y-2">
                                        <Label htmlFor="confirmPassword">Confirm password</Label>
                                        <Input
                                            id="confirmPassword"
                                            type="password"
                                            value={confirmPassword}
                                            onChange={(event) => setConfirmPassword(event.target.value)}
                                            autoComplete="new-password"
                                            className="h-12 px-4 py-0 leading-none"
                                            placeholder="****************"
                                            disabled={isSubmitting}
                                            required
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
                                            "Reset password"
                                        )}
                                    </Button>
                                </form>
                            </>
                        ) : (
                            <div className="space-y-4">
                                <div className="rounded-2xl border border-green-500/20 bg-green-500/5 p-4 text-sm text-muted-foreground">
                                    Your password was reset successfully. All previous vault encryption data has been cleared — sign in to set up a new encrypted vault.
                                </div>
                                <Button asChild className="w-full">
                                    <Link href="/login">Return to login</Link>
                                </Button>
                            </div>
                        )}

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
