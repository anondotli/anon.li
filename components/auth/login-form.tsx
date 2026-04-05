"use client"

import * as React from "react"
import { authClient } from "@/lib/auth-client"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Icons } from "@/components/shared/icons"
import { Mail, Check, ArrowLeft, RotateCw } from "lucide-react"
import { analytics } from "@/lib/analytics"

const EMAIL_SENT_KEY = "anon-li-email-sent"
const RESEND_COOLDOWN = 60 // seconds

interface LoginFormProps extends React.HTMLAttributes<HTMLDivElement> {
    mode?: "login" | "register"
    onEmailSentChange?: (sent: boolean) => void
    /** Override default post-auth redirect. Defaults to /dashboard. */
    callbackUrl?: string
}

export function LoginForm({ className, mode = "login", onEmailSentChange, callbackUrl, ...props }: LoginFormProps) {
    const [isLoading, setIsLoading] = React.useState<boolean>(false)
    const [providerLoading, setProviderLoading] = React.useState<string | null>(null)
    const [email, setEmail] = React.useState<string>("")
    const [emailSent, setEmailSent] = React.useState<boolean>(false)
    const [resendCooldown, setResendCooldown] = React.useState<number>(0)
    const [isResending, setIsResending] = React.useState<boolean>(false)

    // Notify parent when email sent state changes
    React.useEffect(() => {
        onEmailSentChange?.(emailSent)
    }, [emailSent, onEmailSentChange])

    // Restore email sent state from sessionStorage on mount
    React.useEffect(() => {
        const storedEmail = sessionStorage.getItem(EMAIL_SENT_KEY)
        if (storedEmail) {
            setEmail(storedEmail)
            setEmailSent(true)
        }
    }, [])

    // Cooldown timer for resend button
    React.useEffect(() => {
        if (resendCooldown > 0) {
            const timer = setTimeout(() => setResendCooldown(resendCooldown - 1), 1000)
            return () => clearTimeout(timer)
        }
    }, [resendCooldown])

    async function onSubmit(event: React.SyntheticEvent) {
        event.preventDefault()
        setIsLoading(true)
        const target = event.target as typeof event.target & {
            email: { value: string }
        }
        const emailValue = target.email.value
        setEmail(emailValue)
        // Store in sessionStorage before navigating
        sessionStorage.setItem(EMAIL_SENT_KEY, emailValue)
        const { error } = await authClient.signIn.magicLink({
            email: emailValue,
            callbackURL: callbackUrl || "/dashboard",
        })

        if (error) {
            setIsLoading(false)
            return
        }

        if (mode === "register") {
            analytics.registrationStarted("email")
        } else {
            analytics.loginStarted("email")
        }
        setEmailSent(true)
        setIsLoading(false)
        setResendCooldown(RESEND_COOLDOWN)
    }

    const handleResendEmail = async () => {
        if (resendCooldown > 0 || isResending) return

        setIsResending(true)
        const { error } = await authClient.signIn.magicLink({
            email: email,
            callbackURL: callbackUrl || "/dashboard",
        })

        setIsResending(false)
        if (!error) {
            setResendCooldown(RESEND_COOLDOWN)
        }
    }

    const onSignIn = async (provider: "google" | "github") => {
        setProviderLoading(provider)
        if (mode === "register") {
            analytics.registrationStarted(provider)
        } else {
            analytics.loginStarted(provider)
        }
        await authClient.signIn.social({
            provider,
            callbackURL: callbackUrl || "/dashboard",
        })
        setProviderLoading(null)
    }

    const handleUseDifferentEmail = () => {
        sessionStorage.removeItem(EMAIL_SENT_KEY)
        setEmailSent(false)
        setEmail("")
    }

    if (emailSent) {
        return (
            <div className={cn("grid gap-6 text-center", className)} {...props}>
                {/* Animated envelope illustration */}
                <div className="relative mx-auto animate-in fade-in zoom-in-50 duration-500">
                    {/* Glow effect */}
                    <div className="absolute inset-0 h-20 w-20 rounded-full bg-primary/20 blur-xl" />

                    {/* Main icon container */}
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
                        <Mail className="h-9 w-9 text-primary animate-in fade-in duration-700 delay-200" strokeWidth={1.5} />

                        {/* Checkmark badge */}
                        <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 ring-4 ring-background animate-in zoom-in duration-300 delay-500">
                            <Check className="h-4 w-4 text-white" strokeWidth={3} />
                        </div>
                    </div>
                </div>

                {/* Text content */}
                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
                    <h3 className="text-xl font-serif font-semibold tracking-tight">Check your inbox</h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        We sent a magic link to
                    </p>
                    <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2 text-sm font-medium ring-1 ring-border/50">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {email}
                    </div>
                </div>

                {/* Help section */}
                <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-300">
                    <div className="rounded-lg border border-border/50 bg-muted/30 p-4">
                        <p className="text-xs text-muted-foreground leading-relaxed">
                            Click the link in the email to sign in. If you don&apos;t see it, check your spam folder.
                        </p>
                    </div>

                    {/* Resend button */}
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleResendEmail}
                        disabled={resendCooldown > 0 || isResending}
                        className="mx-auto gap-2"
                    >
                        {isResending ? (
                            <Icons.spinner className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                            <RotateCw className="h-3.5 w-3.5" />
                        )}
                        {resendCooldown > 0
                            ? `Resend in ${resendCooldown}s`
                            : "Resend email"
                        }
                    </Button>
                </div>

                {/* Back button */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleUseDifferentEmail}
                    className="mx-auto gap-2 text-muted-foreground hover:text-foreground animate-in fade-in duration-500 delay-500"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Use a different email
                </Button>
            </div>
        )
    }

    return (
        <div className={cn("grid gap-4", className)} {...props}>
            <div className="flex gap-2">
                <Button
                    variant="outline"
                    type="button"
                    className="flex-1 h-11"
                    disabled={isLoading || !!providerLoading}
                    onClick={() => onSignIn("google")}
                >
                    {providerLoading === "google" ? (
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Icons.google className="mr-2 h-4 w-4" />
                    )}
                    Google
                </Button>
                <Button
                    variant="outline"
                    type="button"
                    className="flex-1 h-11"
                    disabled={isLoading || !!providerLoading}
                    onClick={() => onSignIn("github")}
                >
                    {providerLoading === "github" ? (
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Icons.gitHub className="mr-2 h-4 w-4" />
                    )}
                    GitHub
                </Button>
            </div>
            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                        or
                    </span>
                </div>
            </div>
            <form onSubmit={onSubmit}>
                <div className="grid gap-3">
                    <div className="space-y-2">
                        <Label htmlFor="email" className="text-sm font-medium">
                            Email address
                        </Label>
                        <Input
                            id="email"
                            placeholder="you@example.com"
                            type="email"
                            autoCapitalize="none"
                            autoComplete="email"
                            autoCorrect="off"
                            disabled={isLoading || !!providerLoading}
                            required
                            className="h-11"
                        />
                    </div>
                    <Button disabled={isLoading || !!providerLoading} className="h-11">
                        {isLoading ? (
                            <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                        ) : (
                            <Icons.mail className="mr-2 h-4 w-4" />
                        )}
                        {mode === "register" ? "Create account" : "Sign in with email"}
                    </Button>
                </div>
            </form>
        </div>
    )
}
