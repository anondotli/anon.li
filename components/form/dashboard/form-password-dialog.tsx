"use client"

import { useMemo, useRef, useState } from "react"
import { AlertCircle, Check, Eye, EyeOff, Loader2, Lock } from "lucide-react"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cn } from "@/lib/utils"
import { cryptoService } from "@/lib/crypto.client"

export interface PasswordPayload {
    salt: string
    customKeyData: string
    customKeyIv: string
    customKeyVerifier: string
}

interface FormPasswordDialogProps {
    open: boolean
    onOpenChange: (open: boolean) => void
    onApply: (payload: PasswordPayload) => void
    /** Whether a password is already set on the form. Switches the title/CTA copy. */
    hasExistingPassword: boolean
}

const MIN_PASSWORD_LENGTH = 6

export function FormPasswordDialog({
    open,
    onOpenChange,
    onApply,
    hasExistingPassword,
}: FormPasswordDialogProps) {
    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md">
                {open ? (
                    <FormPasswordDialogBody
                        onApply={onApply}
                        onOpenChange={onOpenChange}
                        hasExistingPassword={hasExistingPassword}
                    />
                ) : null}
            </DialogContent>
        </Dialog>
    )
}

function FormPasswordDialogBody({
    onApply,
    onOpenChange,
    hasExistingPassword,
}: {
    onApply: (payload: PasswordPayload) => void
    onOpenChange: (open: boolean) => void
    hasExistingPassword: boolean
}) {
    const [password, setPassword] = useState("")
    const [confirmPassword, setConfirmPassword] = useState("")
    const [reveal, setReveal] = useState(false)
    const [submitting, setSubmitting] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const confirmRef = useRef<HTMLInputElement>(null)

    const strength = useMemo(() => scorePassword(password), [password])
    const matches = confirmPassword.length > 0 && confirmPassword === password
    const tooShort = password.length > 0 && password.length < MIN_PASSWORD_LENGTH
    const canSubmit =
        !submitting &&
        password.length >= MIN_PASSWORD_LENGTH &&
        confirmPassword.length >= MIN_PASSWORD_LENGTH &&
        matches

    const handleSubmit = async (event: React.FormEvent) => {
        event.preventDefault()
        if (password.length < MIN_PASSWORD_LENGTH) {
            setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
            return
        }
        if (password !== confirmPassword) {
            setError("Passwords don't match")
            return
        }
        setSubmitting(true)
        setError(null)
        try {
            const witness = cryptoService.generateSalt()
            const result = await cryptoService.encryptKeyWithPassword(witness, password)
            // The parent's onApply is responsible for closing the dialog. We deliberately
            // avoid calling onOpenChange(false) here because the parent's onOpenChange
            // handler distinguishes "user cancelled" from "user applied" — and a follow-up
            // close call would race with the apply state updates and revert the toggle.
            onApply({
                salt: result.salt,
                customKeyData: result.encryptedKey,
                customKeyIv: result.iv,
                customKeyVerifier: await hashCustomKeyWitness(witness),
            })
        } catch {
            setError("Couldn't encrypt password. Try again.")
        } finally {
            setSubmitting(false)
        }
    }

    return (
        <>
            <DialogHeader>
                <DialogTitle className="flex items-center gap-2 font-serif text-xl tracking-tight">
                    <Lock className="h-4 w-4 text-muted-foreground" />
                    {hasExistingPassword ? "Change password" : "Set form password"}
                </DialogTitle>
                <DialogDescription>
                    Respondents will need this password to open the form. We never store it —
                    only a derived check value lives on our servers.
                </DialogDescription>
            </DialogHeader>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                    <Label htmlFor="form-password" className="text-xs">
                        Password
                    </Label>
                    <div className="relative">
                        <Input
                            id="form-password"
                            type={reveal ? "text" : "password"}
                            value={password}
                            onChange={(event) => {
                                setPassword(event.target.value)
                                if (error) setError(null)
                            }}
                            onKeyDown={(event) => {
                                if (
                                    event.key === "Enter" &&
                                    !event.nativeEvent.isComposing &&
                                    password.length >= MIN_PASSWORD_LENGTH
                                ) {
                                    event.preventDefault()
                                    confirmRef.current?.focus()
                                }
                            }}
                            placeholder={`At least ${MIN_PASSWORD_LENGTH} characters`}
                            autoFocus
                            autoComplete="new-password"
                            disabled={submitting}
                            className="pr-9"
                            aria-describedby="form-password-strength"
                        />
                        <button
                            type="button"
                            onClick={() => setReveal((value) => !value)}
                            tabIndex={-1}
                            disabled={submitting}
                            aria-label={reveal ? "Hide password" : "Show password"}
                            aria-pressed={reveal}
                            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                        >
                            {reveal ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </button>
                    </div>
                    <PasswordStrengthMeter password={password} strength={strength} />
                </div>
                <div className="space-y-1.5">
                    <Label htmlFor="form-password-confirm" className="text-xs">
                        Confirm password
                    </Label>
                    <div className="relative">
                        <Input
                            ref={confirmRef}
                            id="form-password-confirm"
                            type={reveal ? "text" : "password"}
                            value={confirmPassword}
                            onChange={(event) => {
                                setConfirmPassword(event.target.value)
                                if (error) setError(null)
                            }}
                            placeholder="Repeat the password"
                            autoComplete="new-password"
                            disabled={submitting}
                            className={cn(
                                "pr-9",
                                confirmPassword.length > 0 && !matches && "border-destructive/60 focus-visible:ring-destructive/40",
                            )}
                            aria-invalid={confirmPassword.length > 0 && !matches}
                        />
                        {confirmPassword.length > 0 ? (
                            <span
                                aria-hidden
                                className={cn(
                                    "absolute right-2 top-1/2 -translate-y-1/2",
                                    matches ? "text-emerald-500" : "text-destructive",
                                )}
                            >
                                {matches ? (
                                    <Check className="h-3.5 w-3.5" />
                                ) : (
                                    <AlertCircle className="h-3.5 w-3.5" />
                                )}
                            </span>
                        ) : null}
                    </div>
                    {confirmPassword.length > 0 && !matches ? (
                        <p className="text-xs text-destructive">Passwords don&apos;t match yet</p>
                    ) : null}
                </div>
                {error ? (
                    <p className="flex items-center gap-1.5 text-xs text-destructive">
                        <AlertCircle className="h-3.5 w-3.5" />
                        {error}
                    </p>
                ) : null}
                {tooShort && !error ? (
                    <p className="text-xs text-muted-foreground">
                        {MIN_PASSWORD_LENGTH - password.length} more character
                        {MIN_PASSWORD_LENGTH - password.length === 1 ? "" : "s"} to go.
                    </p>
                ) : null}
                <DialogFooter className="gap-2 sm:gap-2">
                    <Button
                        type="button"
                        variant="outline"
                        onClick={() => onOpenChange(false)}
                        disabled={submitting}
                    >
                        Cancel
                    </Button>
                    <Button type="submit" disabled={!canSubmit}>
                        {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                        {hasExistingPassword ? "Update password" : "Set password"}
                    </Button>
                </DialogFooter>
            </form>
        </>
    )
}

async function hashCustomKeyWitness(witness: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(witness))
    return cryptoService.arrayBufferToBase64Url(digest)
}

interface PasswordStrength {
    score: 0 | 1 | 2 | 3 | 4
    label: "Too short" | "Weak" | "Fair" | "Good" | "Strong"
}

function scorePassword(password: string): PasswordStrength {
    if (password.length === 0) return { score: 0, label: "Too short" }
    if (password.length < MIN_PASSWORD_LENGTH) return { score: 0, label: "Too short" }
    let score = 0
    if (password.length >= 8) score++
    if (password.length >= 12) score++
    if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++
    if (/\d/.test(password) && /[^\w\s]/.test(password)) score++
    const clamped = Math.min(score, 4) as 0 | 1 | 2 | 3 | 4
    const labels: PasswordStrength["label"][] = ["Weak", "Weak", "Fair", "Good", "Strong"]
    return { score: clamped, label: labels[clamped] ?? "Weak" }
}

function PasswordStrengthMeter({
    password,
    strength,
}: {
    password: string
    strength: PasswordStrength
}) {
    if (password.length === 0) {
        return (
            <p id="form-password-strength" className="text-[11px] text-muted-foreground">
                Pick something memorable but hard to guess.
            </p>
        )
    }
    const segments = [0, 1, 2, 3]
    const colorByScore = [
        "bg-destructive/70",
        "bg-destructive/70",
        "bg-amber-500/70",
        "bg-emerald-500/70",
        "bg-emerald-500",
    ]
    return (
        <div id="form-password-strength" className="space-y-1">
            <div className="flex gap-1" aria-hidden>
                {segments.map((seg) => (
                    <span
                        key={seg}
                        className={cn(
                            "h-1 flex-1 rounded-full transition-colors",
                            seg < strength.score ? colorByScore[strength.score] : "bg-muted",
                        )}
                    />
                ))}
            </div>
            <p className="text-[11px] text-muted-foreground" aria-live="polite">
                {strength.label}
            </p>
        </div>
    )
}
