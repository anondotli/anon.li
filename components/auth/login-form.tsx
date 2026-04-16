"use client"

import * as React from "react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Check, Mail, RotateCw } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { analytics } from "@/lib/analytics"
import { requestPasswordResetAction } from "@/actions/session"
import { Icons } from "@/components/shared/icons"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { buildSetupPasswordUrl, sanitizeAuthCallbackUrl } from "@/lib/safe-callback-url"
import {
    arrayBufferToBase64Url,
    base64UrlToArrayBuffer,
    deriveAuthSecret,
    derivePasswordKEK,
    unwrapVaultKey,
} from "@/lib/vault/crypto"
import { readVaultApiData } from "@/lib/vault/client"
import { setVaultRuntime } from "@/lib/vault/runtime"

const RESEND_COOLDOWN = 60
const VAULT_MIGRATION_FALLBACK_REMOVAL = "2026-10-01"

if (process.env.NODE_ENV !== "production" && new Date() > new Date(VAULT_MIGRATION_FALLBACK_REMOVAL)) {
    console.warn(`Vault migration raw-password fallback expired on ${VAULT_MIGRATION_FALLBACK_REMOVAL}. Remove the fallback from LoginForm.`)
}

interface LoginFormProps extends React.HTMLAttributes<HTMLDivElement> {
    mode?: "login" | "register"
    onEmailSentChange?: (sent: boolean) => void
    callbackUrl?: string
    initialView?: LoginFormView
    onViewChange?: (view: LoginFormView) => void
}

export type LoginFormView = "login" | "magic-link" | "forgot-password"

type NoticeState =
    | { type: "magic-link"; email: string }
    | { type: "verify-email"; email: string }
    | { type: "reset-password"; email: string }
    | null

function mapAuthError(error: { code?: string; message?: string } | null): string {
    switch (error?.code) {
        case "INVALID_EMAIL_OR_PASSWORD":
            return "Incorrect email or password"
        case "EMAIL_NOT_VERIFIED":
            return "Verify your email address before signing in"
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
    initialView = "login",
    onViewChange,
    ...props
}: LoginFormProps) {
    const router = useRouter()
    const [notice, setNotice] = React.useState<NoticeState>(null)
    const [isLoading, setIsLoading] = React.useState(false)
    const [providerLoading, setProviderLoading] = React.useState<string | null>(null)
    const [password, setPassword] = React.useState("")
    const [email, setEmail] = React.useState("")
    const [confirmPassword, setConfirmPassword] = React.useState("")
    const [formError, setFormError] = React.useState<string | null>(null)
    const [view, setView] = React.useState<LoginFormView>(mode === "login" ? initialView : "login")
    const [resendCooldown, setResendCooldown] = React.useState(0)
    const [emailEngaged, setEmailEngaged] = React.useState(false)
    const [passwordEngaged, setPasswordEngaged] = React.useState(false)
    const [loginFormEngaged, setLoginFormEngaged] = React.useState(mode === "login" && initialView !== "login")

    React.useEffect(() => {
        onEmailSentChange?.(Boolean(notice))
    }, [notice, onEmailSentChange])

    React.useEffect(() => {
        if (resendCooldown <= 0) return
        const timer = window.setTimeout(() => setResendCooldown((value) => value - 1), 1000)
        return () => window.clearTimeout(timer)
    }, [resendCooldown])

    React.useEffect(() => {
        if (mode === "login") {
            onViewChange?.(view)
        }
    }, [mode, onViewChange, view])

    const destination = sanitizeAuthCallbackUrl(callbackUrl)
    const emailActive = emailEngaged || email.length > 0
    const passwordActive = passwordEngaged || password.length > 0
    const isMagicLinkMode = mode === "login" && view === "magic-link"
    const isForgotPasswordMode = mode === "login" && view === "forgot-password"
    const isPasswordSignInMode = mode === "login" && view === "login"
    const showLoginCredentialFlow = mode === "login" && (
        loginFormEngaged ||
        email.length > 0 ||
        password.length > 0 ||
        isMagicLinkMode ||
        isForgotPasswordMode
    )
    const showPasswordInput = mode === "register" ? emailActive : isPasswordSignInMode && showLoginCredentialFlow
    const showConfirmPassword = mode === "register" && showPasswordInput && passwordActive
    const showSocialOptions = mode === "register"
        ? !emailActive
        : !isForgotPasswordMode && (isMagicLinkMode || !showLoginCredentialFlow)

    const setFormView = (nextView: LoginFormView) => {
        setView(nextView)
        setFormError(null)
        if (mode === "login") {
            setLoginFormEngaged(true)
        }

        if (nextView !== "login") {
            setPassword("")
            setPasswordEngaged(false)
            setConfirmPassword("")
        }
    }

    const handleEmailChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextEmail = event.target.value
        setEmail(nextEmail)
        setFormError(null)
        setEmailEngaged((isEngaged) =>
            mode === "register" ? isEngaged || nextEmail.length > 0 : nextEmail.length > 0,
        )
        if (mode === "login" && nextEmail.length > 0) {
            setLoginFormEngaged(true)
        }
    }

    const handlePasswordChange = (event: React.ChangeEvent<HTMLInputElement>) => {
        const nextPassword = event.target.value
        setPassword(nextPassword)
        setFormError(null)

        if (mode === "login" && nextPassword.length > 0) {
            setLoginFormEngaged(true)
        }

        if (mode === "register") {
            const isEngaged = nextPassword.length > 0
            setPasswordEngaged(isEngaged)
            if (!isEngaged) {
                setConfirmPassword("")
            }
        }
    }

    const handleSocialSignIn = async (provider: "google" | "github") => {
        setProviderLoading(provider)
        if (mode === "register") {
            analytics.registrationStarted(provider)
        } else {
            analytics.loginStarted(provider)
        }
        await authClient.signIn.social({
            provider,
            callbackURL: buildSetupPasswordUrl(destination),
        })
        setProviderLoading(null)
    }

    const sendMagicLink = async () => {
        const normalizedEmail = email.trim()
        if (!normalizedEmail) {
            throw new Error("Enter your email address")
        }

        const result = await authClient.signIn.magicLink({
            email: normalizedEmail,
            callbackURL: buildSetupPasswordUrl(destination),
        })

        if (result.error) {
            throw new Error(mapAuthError(result.error))
        }

        setNotice({ type: "magic-link", email })
        setResendCooldown(RESEND_COOLDOWN)
    }

    const sendPasswordResetLink = async () => {
        const normalizedEmail = email.trim()
        if (!normalizedEmail) {
            throw new Error("Enter your email address")
        }

        const result = await requestPasswordResetAction(normalizedEmail)

        if (result.error) {
            throw new Error(result.error)
        }

        setNotice({ type: "reset-password", email })
        setResendCooldown(RESEND_COOLDOWN)
    }

    const handleRegister = async () => {
        const normalizedEmail = email.trim()

        if (!normalizedEmail) {
            throw new Error("Enter your email address")
        }

        if (password.length < 12) {
            throw new Error("Password must be at least 12 characters")
        }

        if (password !== confirmPassword) {
            throw new Error("Passwords do not match")
        }

        const result = await authClient.signUp.email({
            email: normalizedEmail,
            password,
            name: getDefaultUserName(),
            callbackURL: buildSetupPasswordUrl(destination),
        })

        if (result.error) {
            throw new Error(mapAuthError(result.error))
        }

        analytics.registrationStarted("email")
        setNotice({ type: "verify-email", email })
    }

    const handleLogin = async () => {
        const normalizedEmail = email.trim()

        if (!normalizedEmail) {
            throw new Error("Enter your email address")
        }

        if (password.length === 0) {
            throw new Error("Enter your password")
        }

        if (password.length < 12) {
            throw new Error("Password must be at least 12 characters")
        }

        const bootstrap = await readVaultApiData<{ authSalt: string }>("/api/vault/bootstrap", {
            method: "POST",
            body: JSON.stringify({ email: normalizedEmail }),
        })

        const authSecret = arrayBufferToBase64Url(await deriveAuthSecret(password, bootstrap.authSalt))
        let result = await authClient.signIn.email({
            email: normalizedEmail,
            password: authSecret,
        })

        // TODO(2026-10-01): remove raw-password fallback after the vault migration window closes.
        if (result.error?.code === "INVALID_EMAIL_OR_PASSWORD") {
            result = await authClient.signIn.email({
                email: normalizedEmail,
                password,
            })
        }

        if (result.error) {
            throw new Error(mapAuthError(result.error))
        }

        if ((result as { data?: { twoFactorRedirect?: boolean } }).data?.twoFactorRedirect) {
            return
        }

        analytics.loginStarted("email")

        const migration = await readVaultApiData<{
            vaultAvailable: boolean
            hasVault: boolean
        }>("/api/vault/migration-status")

        if (!migration.vaultAvailable) {
            router.push(destination)
            return
        }

        if (!migration.hasVault) {
            router.push(buildSetupPasswordUrl(destination))
            return
        }

        const materials = await readVaultApiData<{
            vaultSalt: string
            passwordWrappedVaultKey: string
            vaultGeneration: number
            vaultId: string
        }>("/api/vault/unlock")

        const passwordKey = await derivePasswordKEK(password, materials.vaultSalt)
        const vaultKey = await unwrapVaultKey(
            base64UrlToArrayBuffer(materials.passwordWrappedVaultKey),
            passwordKey,
        )

        setVaultRuntime(vaultKey, materials.vaultGeneration, materials.vaultId)
        router.push(destination)
    }

    const onSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault()
        setIsLoading(true)
        setFormError(null)

        try {
            if (mode === "register") {
                await handleRegister()
            } else if (isForgotPasswordMode) {
                await sendPasswordResetLink()
            } else if (isMagicLinkMode) {
                await sendMagicLink()
            } else {
                await handleLogin()
            }
        } catch (error) {
            setFormError(error instanceof Error ? error.message : "Authentication failed")
        } finally {
            setIsLoading(false)
        }
    }

    const handleNoticeResend = async () => {
        setIsLoading(true)
        setFormError(null)

        try {
            if (notice?.type === "reset-password") {
                await sendPasswordResetLink()
            } else if (notice?.type === "magic-link") {
                await sendMagicLink()
            }
        } catch (error) {
            setNotice(null)
            setFormError(error instanceof Error ? error.message : "Request failed")
        } finally {
            setIsLoading(false)
        }
    }

    if (notice) {
        const isVerificationNotice = notice.type === "verify-email"
        const isResetNotice = notice.type === "reset-password"

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
                        {isVerificationNotice ? "Verify your email" : "Check your inbox"}
                    </h3>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        {isVerificationNotice
                            ? "We sent a verification link to"
                            : isResetNotice
                            ? "We sent a password reset link to"
                            : "We sent a magic link to"}
                    </p>
                    <div className="inline-flex items-center gap-2 rounded-full bg-muted/50 px-4 py-2 text-sm font-medium ring-1 ring-border/50">
                        <Mail className="h-3.5 w-3.5 text-muted-foreground" />
                        {notice.email}
                    </div>
                </div>

                <div className="rounded-lg border border-border/50 bg-muted/30 p-4 text-xs text-muted-foreground leading-relaxed">
                    {isVerificationNotice
                        ? "Open the verification link to sign in automatically, then finish setting up your encrypted vault."
                        : isResetNotice
                        ? "This will destroy your encrypted vault — previously encrypted data will become inaccessible."
                        : "Open the magic link to sign in and continue your vault setup if this account still needs migration."}
                </div>

                {!isVerificationNotice && (
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void handleNoticeResend()}
                        disabled={isLoading || resendCooldown > 0}
                        className="mx-auto gap-2"
                    >
                        <RotateCw className="h-3.5 w-3.5" />
                        {resendCooldown > 0 ? `Resend in ${resendCooldown}s` : "Resend email"}
                    </Button>
                )}

                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                        setNotice(null)
                        setFormError(null)
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
                        onFocus={() => {
                            setEmailEngaged(true)
                            if (mode === "login") {
                                setLoginFormEngaged(true)
                            }
                        }}
                        onChange={handleEmailChange}
                        autoCapitalize="none"
                        autoComplete="email"
                        autoCorrect="off"
                        disabled={isLoading || !!providerLoading}
                        required
                    />
                </div>

                {showPasswordInput ? (
                    <>
                        <div className="space-y-2">
                            <Label htmlFor="password">Password</Label>
                            <Input
                                id="password"
                                type="password"
                                value={password}
                                placeholder="********"
                                onFocus={() => {
                                    setPasswordEngaged(true)
                                    if (mode === "login") {
                                        setLoginFormEngaged(true)
                                    }
                                }}
                                onBlur={() => {
                                    if (mode === "register" && password.length === 0) {
                                        setPasswordEngaged(false)
                                        setConfirmPassword("")
                                    }
                                }}
                                onChange={handlePasswordChange}
                                autoComplete={mode === "register" ? "new-password" : "current-password"}
                                disabled={isLoading || !!providerLoading}
                                required={showPasswordInput}
                            />
                        </div>

                        {mode === "login" && (
                            <div className="flex items-center justify-between gap-3 text-sm">
                                <button
                                    type="button"
                                    onClick={() => setFormView("magic-link")}
                                    className="text-muted-foreground transition-colors hover:text-foreground"
                                >
                                    Use magic link instead
                                </button>
                                <button
                                    type="button"
                                    onClick={() => setFormView("forgot-password")}
                                    className="text-primary hover:underline"
                                >
                                    Forgot password?
                                </button>
                            </div>
                        )}

                        {showConfirmPassword && (
                            <div className="space-y-2">
                                <Label htmlFor="confirmPassword">Confirm password</Label>
                                <Input
                                    id="confirmPassword"
                                    type="password"
                                    value={confirmPassword}
                                    onChange={(event) => setConfirmPassword(event.target.value)}
                                    autoComplete="new-password"
                                    disabled={isLoading || !!providerLoading}
                                    required={showConfirmPassword}
                                />
                            </div>
                        )}
                    </>
                ) : null}

                {mode === "login" && isMagicLinkMode && (
                    <div className="text-sm">
                        <button
                            type="button"
                            onClick={() => setFormView("login")}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Use password instead
                        </button>
                    </div>
                )}

                {mode === "login" && isForgotPasswordMode && (
                    <div className="text-sm">
                        <button
                            type="button"
                            onClick={() => setFormView("login")}
                            className="text-muted-foreground transition-colors hover:text-foreground"
                        >
                            Back to sign in
                        </button>
                    </div>
                )}

                {formError && (
                    <div className="rounded-2xl border border-destructive/20 bg-destructive/10 px-4 py-3 text-sm text-destructive">
                        {formError}
                    </div>
                )}

                <Button disabled={isLoading || !!providerLoading} className="h-11">
                    {isLoading ? (
                        <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                    ) : mode === "register" ? (
                        <Icons.mail className="mr-2 h-4 w-4" />
                    ) : isMagicLinkMode || isForgotPasswordMode ? (
                        <Icons.mail className="mr-2 h-4 w-4" />
                    ) : null}
                    {mode === "register"
                        ? "Create account"
                        : isForgotPasswordMode
                        ? "Send reset link"
                        : isMagicLinkMode
                        ? "Send magic link"
                        : "Sign in"}
                </Button>
            </form>

            {showSocialOptions && (
                <>
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
                </>
            )}
        </div>
    )
}
