"use client"

import { useState, useRef, useEffect } from "react"
import { Button } from "@/components/ui/button"
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot,
} from "@/components/ui/input-otp"
import { Input } from "@/components/ui/input"
import { Icons } from "@/components/shared/icons"
import { verifyTwoFactorLogin } from "@/actions/two-factor"
import { toast } from "sonner"
import { Shield, ShieldAlert, ShieldCheck, KeyRound } from "lucide-react"
import { cn } from "@/lib/utils"

type VerifyStatus = "idle" | "verifying" | "error" | "success"
type InputMode = "totp" | "backup"

export function TwoFactorVerifyForm() {
    const [code, setCode] = useState("")
    const [backupCode, setBackupCode] = useState("")
    const [inputMode, setInputMode] = useState<InputMode>("totp")
    const [status, setStatus] = useState<VerifyStatus>("idle")
    const inputRef = useRef<HTMLInputElement>(null)
    const backupInputRef = useRef<HTMLInputElement>(null)

    // Auto-focus input on mount and when switching modes
    useEffect(() => {
        if (inputMode === "totp") {
            inputRef.current?.focus()
        } else {
            backupInputRef.current?.focus()
        }
    }, [inputMode])

    const showError = (message: string) => {
        setStatus("error")
        toast.error(message)
        setTimeout(() => {
            if (inputMode === "totp") {
                setCode("")
                inputRef.current?.focus()
            } else {
                setBackupCode("")
                backupInputRef.current?.focus()
            }
            setStatus("idle")
        }, 600)
    }

    const verifyCode = async (codeToVerify: string) => {
        setStatus("verifying")

        const result = await verifyTwoFactorLogin(codeToVerify, inputMode)
        if (result.error) {
            showError(result.error)
            return
        }

        setStatus("success")
        toast.success("Verification successful")
        window.location.href = result.redirectTo ?? "/dashboard/alias"
    }

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault()

        if (inputMode === "totp") {
            if (code.length < 6) {
                toast.error("Please enter a valid 6-digit code")
                return
            }
            verifyCode(code)
        } else {
            const sanitized = backupCode.replace(/\s/g, "")
            if (!/^[A-Za-z0-9]{5}-[A-Za-z0-9]{11}$/.test(sanitized)) {
                toast.error("Invalid backup code format")
                return
            }
            verifyCode(sanitized)
        }
    }

    const handleBackupCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (status === "verifying" || status === "error") return
        const value = e.target.value.replace(/[^A-Za-z0-9-]/g, "").slice(0, 17)
        setBackupCode(value)
    }

    const toggleInputMode = () => {
        setInputMode(prev => prev === "totp" ? "backup" : "totp")
        setCode("")
        setBackupCode("")
        setStatus("idle")
    }

    const handleCodeChange = (value: string) => {
        // Don't allow changes while verifying or in error state
        if (status === "verifying" || status === "error") return

        setCode(value)

        // Auto-submit when 6 digits are entered
        if (value.length === 6) {
            verifyCode(value)
        }
    }

    const getStatusIcon = () => {
        switch (status) {
            case "verifying":
                return <Icons.spinner className="h-6 w-6 text-primary animate-spin" />
            case "error":
                return <ShieldAlert className="h-6 w-6 text-destructive" />
            case "success":
                return <ShieldCheck className="h-6 w-6 text-green-500" />
            default:
                return inputMode === "backup"
                    ? <KeyRound className="h-6 w-6 text-primary" />
                    : <Shield className="h-6 w-6 text-primary" />
        }
    }

    const getStatusStyles = () => {
        switch (status) {
            case "error":
                return "bg-destructive/10 ring-2 ring-destructive/20"
            case "success":
                return "bg-green-500/10 ring-2 ring-green-500/20"
            case "verifying":
                return "bg-primary/10 ring-2 ring-primary/20"
            default:
                return "bg-primary/10"
        }
    }

    const isDisabled = status === "verifying" || status === "success"

    return (
        <form onSubmit={handleSubmit} className="grid gap-6">
            <div className="flex justify-center">
                <div className={cn(
                    "mx-auto flex h-14 w-14 items-center justify-center rounded-full transition-all duration-300",
                    getStatusStyles()
                )}>
                    {getStatusIcon()}
                </div>
            </div>
            <div className="space-y-4">
                <div className="flex justify-center">
                    {inputMode === "totp" ? (
                        <InputOTP
                            ref={inputRef}
                            maxLength={6}
                            value={code}
                            onChange={handleCodeChange}
                            disabled={isDisabled}
                            autoFocus
                            className={cn(
                                status === "error" && "animate-shake"
                            )}
                        >
                            <InputOTPGroup>
                                <InputOTPSlot
                                    index={0}
                                    className={cn(
                                        "transition-colors duration-200",
                                        status === "error" && "border-destructive text-destructive",
                                        status === "success" && "border-green-500 text-green-500"
                                    )}
                                />
                                <InputOTPSlot
                                    index={1}
                                    className={cn(
                                        "transition-colors duration-200",
                                        status === "error" && "border-destructive text-destructive",
                                        status === "success" && "border-green-500 text-green-500"
                                    )}
                                />
                                <InputOTPSlot
                                    index={2}
                                    className={cn(
                                        "transition-colors duration-200",
                                        status === "error" && "border-destructive text-destructive",
                                        status === "success" && "border-green-500 text-green-500"
                                    )}
                                />
                            </InputOTPGroup>
                            <InputOTPSeparator />
                            <InputOTPGroup>
                                <InputOTPSlot
                                    index={3}
                                    className={cn(
                                        "transition-colors duration-200",
                                        status === "error" && "border-destructive text-destructive",
                                        status === "success" && "border-green-500 text-green-500"
                                    )}
                                />
                                <InputOTPSlot
                                    index={4}
                                    className={cn(
                                        "transition-colors duration-200",
                                        status === "error" && "border-destructive text-destructive",
                                        status === "success" && "border-green-500 text-green-500"
                                    )}
                                />
                                <InputOTPSlot
                                    index={5}
                                    className={cn(
                                        "transition-colors duration-200",
                                        status === "error" && "border-destructive text-destructive",
                                        status === "success" && "border-green-500 text-green-500"
                                    )}
                                />
                            </InputOTPGroup>
                        </InputOTP>
                    ) : (
                        <Input
                            ref={backupInputRef}
                            type="text"
                            value={backupCode}
                            onChange={handleBackupCodeChange}
                            disabled={isDisabled}
                            placeholder="XXXXX-XXXXXXXXXXX"
                            maxLength={17}
                            autoFocus
                            className={cn(
                                "text-center font-mono text-lg tracking-widest max-w-[220px]",
                                status === "error" && "border-destructive text-destructive animate-shake",
                                status === "success" && "border-green-500 text-green-500"
                            )}
                        />
                    )}
                </div>
                <p className={cn(
                    "text-xs text-center transition-colors duration-200",
                    status === "error" ? "text-destructive" : "text-muted-foreground"
                )}>
                    {status === "error"
                        ? "Invalid code. Please try again."
                        : status === "verifying"
                        ? "Verifying..."
                        : status === "success"
                        ? "Success! Redirecting..."
                        : inputMode === "totp"
                        ? "Enter the 6-digit code from your authenticator app"
                        : "Enter your backup code (XXXXX-XXXXXXXXXXX)"
                    }
                </p>
            </div>
            <Button
                disabled={isDisabled || (inputMode === "totp" ? code.length < 6 : backupCode.length < 17)}
                className={cn(
                    "h-11 transition-all duration-200",
                    status === "success" && "bg-green-500 hover:bg-green-500"
                )}
            >
                {status === "verifying" ? (
                    <Icons.spinner className="mr-2 h-4 w-4 animate-spin" />
                ) : status === "success" ? (
                    <ShieldCheck className="mr-2 h-4 w-4" />
                ) : inputMode === "backup" ? (
                    <KeyRound className="mr-2 h-4 w-4" />
                ) : (
                    <Shield className="mr-2 h-4 w-4" />
                )}
                {status === "success" ? "Verified" : "Verify"}
            </Button>
            <button
                type="button"
                onClick={toggleInputMode}
                disabled={isDisabled}
                className="text-xs text-muted-foreground text-center hover:text-foreground transition-colors underline-offset-4 hover:underline disabled:opacity-50"
            >
                {inputMode === "totp"
                    ? "Use backup code instead"
                    : "Use authenticator app"
                }
            </button>
        </form>
    )
}
