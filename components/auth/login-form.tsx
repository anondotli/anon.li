"use client"

import * as React from "react"
import { ArrowLeft, Check, Mail, RotateCw } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { analytics } from "@/lib/analytics"
import { Icons } from "@/components/shared/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Turnstile } from "@/components/ui/turnstile"
import { cn } from "@/lib/utils"
import { buildSetupPasswordUrl } from "@/lib/safe-callback-url"

const RESEND_COOLDOWN = 60
const turnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY

interface LoginFormProps extends React.HTMLAttributes<HTMLDivElement> {
    mode?: "login" | "register"
    onEmailSentChange?: (sent: boolean) => void
    callbackUrl?: string
}

type NoticeState = { type: "magic-link"; email: string } | null

function mapAuthError(error: { code?: string; message?: string } | null): string {
    switch (error?.code) {
        case "USER_ALREADY_EXISTS":
            return "An account already exists for this email address"
        default:
            return error?.message || "Authentication failed"
    }
}

function getDefaultUserName() {
    return "anon.li user"
}

export function LoginForm({
    className,
    mode = "login",
    onEmailSentChange,
    callbackUrl,
    ...props
}: LoginFormProps) {
    const [notice, setNotice] = React.useState<NoticeState>(null)
    const [isLoading, setIsLoading] = React.useState(false)
    const [providerLoading, setProviderLoading] = React.useState<string | null>(null)
    const [email, setEmail] = React.useState("")
    const [formError, setFormError] = React.useState<string | null>(null)
    const [resendCooldown, setResendCooldown] = React.useState(0)
    const [turnstileToken, setTurnstileToken] = React.useState<string | null>(null)
    const [turnstileRequested, setTurnstileRequested] = React.useState(false)
    const [turnstileRenderKey, setTurnstileRenderKey] = React.useState(0)

    React.useEffect(() => {
        onEmailSentChange?.(Boolean(notice))
    }, [notice, onEmailSentChange])

    React.useEffect(() => {
        if (resendCooldown <= 0) return
        const timer = window.setTimeout(() => setResendCooldown((value) => value - 1), 1000)
        return () => window.clearTimeout(timer)
    }, [resendCooldown])

    const destination = buildSetupPasswordUrl(callbackUrl)

    const resetTurnstile = React.useCallback(() => {
        setTurnstileToken(null)
        setTurnstileRenderKey((key) => key + 1)
    }, [])

    const handleSocialSignIn = async (provider: "google" | "github") => {
        setProviderLoading(provider)
        setFormError(null)

        try {
            if (mode === "register") {
                analytics.registrationStarted(provider)
            } else {
                analytics.loginStarted(provider)
            }

            await authClient.signIn.social({
                provider,
                callbackURL: destination,
            })
        } finally {
            setProviderLoading(null)
        }
    }

    const sendMagicLink = async (verifiedTurnstileToken?: string) => {
        const normalizedEmail = email.trim()
        if (!normalizedEmail) {
            throw new Error("Enter your email address")
        }

        const tokenForSubmit = verifiedTurnstileToken ?? turnstileToken
        if (turnstileSiteKey && !tokenForSubmit) {
            setTurnstileRequested(true)
            return
        }

        try {
            const result = await authClient.signIn.magicLink({
                email: normalizedEmail,
                ...(mode === "register" ? { name: getDefaultUserName() } : {}),
                callbackURL: destination,
                newUserCallbackURL: destination,
                ...(turnstileSiteKey
                    ? {
                        fetchOptions: {
                            headers: { "x-captcha-response": tokenForSubmit! },
                        },
                    }
                    : {}),
            })

            if (result.error) {
                throw new Error(mapAuthError(result.error))
            }
        } finally {
            if (turnstileSiteKey) {
                resetTurnstile()
            }
        }

        if (mode === "register") {
            analytics.registrationStarted("magic_link")
        } else {
            analytics.loginStarted("magic_link")
        }

        setNotice({ type: "magic-link", email: normalizedEmail })
        setTurnstileRequested(false)
        setResendCooldown(RESEND_COOLDOWN)
    }

    const submitMagicLink = async (verifiedTurnstileToken?: string, fallbackMessage = "Authentication failed") => {
        setIsLoading(true)
        setFormError(null)

        try {
            await sendMagicLink(verifiedTurnstileToken)
        } catch (error) {
            setFormError(error instanceof Error ? error.message : fallbackMessage)
        } finally {
            setIsLoading(false)
        }
    }

    const handleTurnstileVerify = (token: string) => {
        setTurnstileToken(token)
        setTurnstileRequested(false)
        void submitMagicLink(token)
    }

    const onSubmit = (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        void submitMagicLink()
    }

    const hasEmail = email.trim().length > 0
    const showTurnstile = !!turnstileSiteKey && hasEmail && turnstileRequested
    const magicLinkDisabled = isLoading || !!providerLoading || (showTurnstile && !turnstileToken)

    const handleNoticeResend = async () => {
        void submitMagicLink(undefined, "Request failed")
    }

    if (notice) {
        return (
            <div className={cn("grid gap-6 text-center", className)} {...props}>
                <div className="relative mx-auto animate-in fade-in zoom-in-50 duration-500">
                    <div className="absolute inset-0 h-20 w-20 rounded-full bg-primary/20 blur-xl" />
                    <div className="relative flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary/10 to-primary/5 ring-1 ring-primary/20">
                        <Mail className="h-9 w-9 text-primary animate-in fade-in duration-700 delay-200" strokeWidth={1.5} />
                        <div className="absolute -right-1 -top-1 flex h-7 w-7 items-center justify-center rounded-full bg-green-500 ring-4 ring-background animate-in zoom-in duration-300 delay-500">
                            <Check className="h-4 w-4 text-white" strokeWidth={3} />
                        </div>
                    </div>
                </div>

                <div className="space-y-3 animate-in fade-in slide-in-from-bottom-2 duration-500 delay-200">
                    <h3 className="text-xl font-serif font-semibold tracking-tight">
                        Check your inbox
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        We sent a magic link to
                    </p>
                    <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2 text-sm font-medium ring-1 ring-border/50">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {notice.email}
                    </div>
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
                    Open the link to continue. If your vault needs setup, you will create its password after signing in.
                </div>

                {formError && (
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {formError}
                    </div>
                )}

                {turnstileSiteKey && turnstileRequested && (
                    <Turnstile
                        key={`notice-${turnstileRenderKey}`}
                        siteKey={turnstileSiteKey}
                        onVerify={handleTurnstileVerify}
                        onError={resetTurnstile}
                        onExpire={() => setTurnstileToken(null)}
                    />
                )}

                <Button
                    variant="outline"
                    size="sm"
                    onClick={() => void handleNoticeResend()}
                    disabled={isLoading || resendCooldown > 0 || (!!turnstileSiteKey && turnstileRequested && !turnstileToken)}
                    className="mx-auto gap-2"
                >
                    <RotateCw className="h-3.5 w-3.5" />
                    {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
                </Button>

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        setNotice(null)
                        setFormError(null)
                        setTurnstileRequested(false)
                        resetTurnstile()
                    }}
                    className="mx-auto gap-2 text-muted-foreground hover:text-foreground"
                >
                    <ArrowLeft className="h-3.5 w-3.5" />
                    Back
                </Button>
            </div>
        )
    }

    return (
        <div className={cn("grid gap-5", className)} {...props}>
            <form onSubmit={onSubmit} className="grid gap-4">
                <div className="space-y-2">
                    <Label htmlFor="email">Email address</Label>
                    <Input
                        id="email"
                        type="email"
                        value={email}
                        placeholder="joe.doe@anon.li"
                        onChange={(event) => {
                            const next = event.target.value
                            setEmail(next)
                            setFormError(null)
                            if (!next.trim()) {
                                setTurnstileToken(null)
                                setTurnstileRequested(false)
                            }
                        }}
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect="off"
                        disabled={isLoading || !!providerLoading}
                        required
                    />
                </div>

                {formError && (
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {formError}
                    </div>
                )}

                {showTurnstile && (
                    <Turnstile
                        key={`form-${turnstileRenderKey}`}
                        siteKey={turnstileSiteKey!}
                        onVerify={handleTurnstileVerify}
                        onError={resetTurnstile}
                        onExpire={() => setTurnstileToken(null)}
                    />
                )}

                <Button disabled={magicLinkDisabled} className="h-11">
                    {isLoading ? (
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Icons.mail className="mr-2 h-4 w-4" />
                    )}
                    {mode === "register" ? "Create account" : "Send magic link"}
                </Button>
            </form>

            <div className="relative">
                <div className="absolute inset-0 flex items-center">
                    <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                    <span className="bg-background px-2 text-muted-foreground">
                        or continue with
                    </span>
                </div>
            </div>

            <div className="flex gap-2">
                <Button
                    variant="outline"
                    type="button"
                    className="flex-1 h-11"
                    disabled={isLoading || !!providerLoading}
                    onClick={() => void handleSocialSignIn("google")}
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
                    onClick={() => void handleSocialSignIn("github")}
                >
                    {providerLoading === "github" ? (
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                        <Icons.gitHub className="mr-2 h-4 w-4" />
                    )}
                    GitHub
                </Button>
            </div>
        </div>
    )
}
