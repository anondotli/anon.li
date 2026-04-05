"use client"

import { useState, useEffect, useTransition, useCallback, useRef } from "react"
import Image from "next/image"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSeparator,
    InputOTPSlot,
} from "@/components/ui/input-otp"
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle,
} from "@/components/ui/card"
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import { Shield, ShieldCheck, ShieldOff, Copy, Check, AlertTriangle, Loader2, Key, Smartphone, QrCode, ArrowRight } from "lucide-react"
import { toast } from "sonner"
import { cn } from "@/lib/utils"
import {
    initiateTwoFactorSetup,
    verifyAndEnableTwoFactor,
    getTwoFactorStatus,
    disableTwoFactor,
    regenerateBackupCodes,
} from "@/actions/two-factor"

type SetupStep = "qr" | "backup" | "verify"

const STEPS: { key: SetupStep; label: string }[] = [
    { key: "qr", label: "Scan" },
    { key: "backup", label: "Backup" },
    { key: "verify", label: "Verify" },
]

function StepIndicator({ current }: { current: SetupStep }) {
    const currentIdx = STEPS.findIndex(s => s.key === current)
    return (
        <div className="flex items-center justify-center gap-1.5">
            {STEPS.map((step, i) => (
                <div key={step.key} className="flex items-center gap-1.5">
                    <div className={cn(
                        "flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-medium transition-all duration-300",
                        i < currentIdx && "bg-foreground text-background",
                        i === currentIdx && "bg-foreground text-background ring-4 ring-foreground/10",
                        i > currentIdx && "bg-muted text-muted-foreground",
                    )}>
                        {i < currentIdx ? (
                            <Check className="h-3 w-3" />
                        ) : (
                            i + 1
                        )}
                    </div>
                    {i < STEPS.length - 1 && (
                        <div className={cn(
                            "h-px w-8 transition-colors duration-300",
                            i < currentIdx ? "bg-foreground" : "bg-border",
                        )} />
                    )}
                </div>
            ))}
        </div>
    )
}

export function TwoFactorSettings() {
    const [isPending, startTransition] = useTransition()
    const [isEnabled, setIsEnabled] = useState<boolean | null>(null)
    const [showSetupDialog, setShowSetupDialog] = useState(false)
    const [showDisableDialog, setShowDisableDialog] = useState(false)
    const [showBackupCodesDialog, setShowBackupCodesDialog] = useState(false)

    const [qrCode, setQrCode] = useState<string>("")
    const [secret, setSecret] = useState<string>("")
    const [backupCodes, setBackupCodes] = useState<string[]>([])
    const [verificationCode, setVerificationCode] = useState("")
    const [disableCode, setDisableCode] = useState("")
    const [regenerateCode, setRegenerateCode] = useState("")
    const [setupStep, setSetupStep] = useState<SetupStep>("qr")
    const [copiedSecret, setCopiedSecret] = useState(false)
    const [copiedBackup, setCopiedBackup] = useState(false)
    const otpRef = useRef<HTMLInputElement>(null)

    const loadStatus = useCallback(() => {
        startTransition(async () => {
            const result = await getTwoFactorStatus()
            if (result.success) {
                setIsEnabled(result.enabled ?? false)
            }
        })
    }, [])

    useEffect(() => {
        loadStatus()
    }, [loadStatus])

    // Auto-focus OTP input when reaching verify step
    useEffect(() => {
        if (setupStep === "verify") {
            setTimeout(() => otpRef.current?.focus(), 100)
        }
    }, [setupStep])

    const handleStartSetup = () => {
        startTransition(async () => {
            const result = await initiateTwoFactorSetup()
            if (result.error) {
                toast.error(result.error)
            } else if (result.success) {
                setQrCode(result.qrCodeDataUrl || "")
                setSecret(result.secret || "")
                setBackupCodes(result.backupCodes || [])
                setSetupStep("qr")
                setShowSetupDialog(true)
            }
        })
    }

    const handleVerify = (code?: string) => {
        const codeToVerify = code || verificationCode
        if (codeToVerify.length !== 6) return
        startTransition(async () => {
            const result = await verifyAndEnableTwoFactor(codeToVerify)
            if (result.error) {
                toast.error(result.error)
                setVerificationCode("")
                setTimeout(() => otpRef.current?.focus(), 100)
            } else if (result.success) {
                toast.success("Two-factor authentication enabled!")
                setShowSetupDialog(false)
                setIsEnabled(true)
                resetSetupState()
            }
        })
    }

    const handleDisable = () => {
        startTransition(async () => {
            const result = await disableTwoFactor(disableCode)
            if (result.error) {
                toast.error(result.error)
            } else if (result.success) {
                toast.success("Two-factor authentication disabled")
                setShowDisableDialog(false)
                setIsEnabled(false)
                setDisableCode("")
            }
        })
    }

    const handleRegenerateBackupCodes = () => {
        startTransition(async () => {
            const result = await regenerateBackupCodes(regenerateCode)
            if (result.error) {
                toast.error(result.error)
            } else if (result.success) {
                setBackupCodes(result.backupCodes || [])
                setRegenerateCode("")
                toast.success("Backup codes regenerated")
            }
        })
    }

    const resetSetupState = () => {
        setQrCode("")
        setSecret("")
        setBackupCodes([])
        setVerificationCode("")
        setSetupStep("qr")
    }

    const copySecret = async () => {
        await navigator.clipboard.writeText(secret)
        setCopiedSecret(true)
        toast.success("Secret copied")
        setTimeout(() => setCopiedSecret(false), 2000)
    }

    const copyBackupCodes = async () => {
        await navigator.clipboard.writeText(backupCodes.join("\n"))
        setCopiedBackup(true)
        toast.success("Backup codes copied")
        setTimeout(() => setCopiedBackup(false), 2000)
    }

    if (isEnabled === null) {
        return (
            <Card className="rounded-3xl border-border/40 shadow-sm overflow-hidden">
                <CardHeader className="p-8 pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/10">
                                <Shield className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <CardTitle className="text-lg font-medium">Two-Factor Authentication</CardTitle>
                                <CardDescription className="text-sm">
                                    Secure your account with TOTP
                                </CardDescription>
                            </div>
                        </div>
                    </div>
                </CardHeader>
                <CardContent className="p-8 pt-0">
                    <div className="flex items-center justify-center py-8">
                        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
                    </div>
                </CardContent>
            </Card>
        )
    }

    return (
        <>
            <Card className="rounded-3xl border-border/40 shadow-sm overflow-hidden">
                <CardHeader className="p-8 pb-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className={`flex h-10 w-10 items-center justify-center rounded-xl ${isEnabled ? "bg-green-500/10" : "bg-muted"}`}>
                                {isEnabled ? (
                                    <ShieldCheck className="h-5 w-5 text-green-600" />
                                ) : (
                                    <Shield className="h-5 w-5 text-muted-foreground" />
                                )}
                            </div>
                            <div>
                                <CardTitle className="text-lg font-medium">Two-Factor Authentication</CardTitle>
                                <CardDescription className="text-sm">
                                    Add an extra layer of security to your account
                                </CardDescription>
                            </div>
                        </div>
                        <Badge variant={isEnabled ? "default" : "secondary"} className={isEnabled ? "bg-green-500/10 text-green-600 hover:bg-green-500/20 border-green-500/20" : ""}>
                            {isEnabled ? "Enabled" : "Disabled"}
                        </Badge>
                    </div>
                </CardHeader>
                <CardContent className="p-8 pt-0 space-y-4">
                    {isEnabled ? (
                        <div className="rounded-xl bg-muted/50 p-4 space-y-4">
                            <div className="flex items-start gap-3">
                                <Smartphone className="h-5 w-5 text-muted-foreground mt-0.5" />
                                <div className="space-y-1 flex-1">
                                    <p className="text-sm font-medium">Authenticator App</p>
                                    <p className="text-xs text-muted-foreground">
                                        Your account is protected with time-based one-time passwords
                                    </p>
                                </div>
                            </div>
                            <div className="flex flex-col sm:flex-row gap-2">
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={() => setShowBackupCodesDialog(true)}
                                    className="flex-1 sm:flex-none"
                                >
                                    <Key className="w-4 h-4 mr-2" />
                                    View Backup Codes
                                </Button>
                                <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => setShowDisableDialog(true)}
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                >
                                    <ShieldOff className="h-4 w-4 mr-2" />
                                    Disable
                                </Button>
                            </div>
                        </div>
                    ) : (
                        <div className="rounded-xl border border-dashed border-border/60 p-6 text-center space-y-4">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center">
                                <ShieldOff className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <div className="space-y-1">
                                <p className="text-sm font-medium">Not Enabled</p>
                                <p className="text-xs text-muted-foreground max-w-xs mx-auto">
                                    Protect your account with time-based one-time passwords using an authenticator app like Google Authenticator or Authy.
                                </p>
                            </div>
                            <Button
                                onClick={handleStartSetup}
                                disabled={isPending}
                                size="sm"
                            >
                                {isPending ? (
                                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                ) : (
                                    <Shield className="h-4 w-4 mr-2" />
                                )}
                                Enable 2FA
                            </Button>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Setup Dialog */}
            <Dialog open={showSetupDialog} onOpenChange={(open) => {
                if (!open) resetSetupState()
                setShowSetupDialog(open)
            }}>
                <DialogContent className="sm:max-w-[480px] gap-0 p-0 overflow-hidden">
                    {/* Header with step indicator */}
                    <div className="p-6 pb-0 space-y-5">
                        <DialogHeader className="space-y-1.5">
                            <DialogTitle className="text-xl font-medium font-serif tracking-tight">
                                Set up two-factor authentication
                            </DialogTitle>
                            <DialogDescription className="text-sm">
                                {setupStep === "qr" && "Scan the QR code with your authenticator app."}
                                {setupStep === "backup" && "Store these recovery codes somewhere safe."}
                                {setupStep === "verify" && "Enter the code from your authenticator to finish."}
                            </DialogDescription>
                        </DialogHeader>
                        <StepIndicator current={setupStep} />
                    </div>

                    {/* Step content */}
                    <div className="p-6">
                        {setupStep === "qr" && (
                            <div className="space-y-5">
                                <div className="flex justify-center">
                                    <div className="rounded-2xl bg-white p-3 shadow-sm ring-1 ring-black/5">
                                        {qrCode && (
                                            <Image
                                                src={qrCode}
                                                alt="2FA QR Code"
                                                width={200}
                                                height={200}
                                                className="w-[200px] h-[200px]"
                                                unoptimized
                                            />
                                        )}
                                    </div>
                                </div>
                                <div className="space-y-2">
                                    <p className="text-xs text-muted-foreground">
                                        Can&apos;t scan? Enter this code manually:
                                    </p>
                                    <div className="flex gap-2">
                                        <div className="flex-1 rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs select-all break-all leading-relaxed">
                                            {secret}
                                        </div>
                                        <Button
                                            variant="outline"
                                            size="icon"
                                            onClick={copySecret}
                                            className="shrink-0 h-9 w-9"
                                        >
                                            {copiedSecret ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                                        </Button>
                                    </div>
                                </div>
                                <Button
                                    onClick={() => setSetupStep("backup")}
                                    className="w-full"
                                >
                                    Continue
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </Button>
                            </div>
                        )}

                        {setupStep === "backup" && (
                            <div className="space-y-5">
                                <div className="rounded-xl bg-amber-500/10 border border-amber-500/20 p-3 flex items-start gap-2.5">
                                    <AlertTriangle className="h-4 w-4 text-amber-600 dark:text-amber-400 mt-0.5 shrink-0" />
                                    <div className="space-y-1">
                                        <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
                                            Save these codes now.
                                        </p>
                                        <p className="text-xs text-amber-700 dark:text-amber-400/80">
                                            Each code can be used once to log in if you lose access to your authenticator app. They are stored encrypted and cannot be recovered.
                                        </p>
                                    </div>
                                </div>
                                <div className="rounded-xl border border-border/60 overflow-hidden">
                                    <div className="grid grid-cols-2 divide-x divide-border/60">
                                        {backupCodes.map((code, i) => (
                                            <div
                                                key={i}
                                                className={cn(
                                                    "flex items-center gap-2.5 px-3.5 py-2.5",
                                                    i < backupCodes.length - 2 && "border-b border-border/60",
                                                    i === backupCodes.length - 2 && (backupCodes.length % 2 === 0 ? "border-b-0" : "border-b border-border/60"),
                                                )}
                                            >
                                                <span className="text-[10px] font-medium text-muted-foreground/60 tabular-nums w-3 text-right">
                                                    {i + 1}
                                                </span>
                                                <span className="font-mono text-sm tracking-wide">
                                                    {code}
                                                </span>
                                            </div>
                                        ))}
                                    </div>
                                </div>
                                <Button
                                    variant="outline"
                                    onClick={copyBackupCodes}
                                    className="w-full"
                                    size="sm"
                                >
                                    {copiedBackup ? <Check className="h-3.5 w-3.5 mr-2" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
                                    Copy all codes
                                </Button>
                                <Button
                                    onClick={() => setSetupStep("verify")}
                                    className="w-full"
                                >
                                    I&apos;ve saved my codes
                                    <ArrowRight className="h-4 w-4 ml-2" />
                                </Button>
                            </div>
                        )}

                        {setupStep === "verify" && (
                            <div className="space-y-6">
                                <div className="flex flex-col items-center gap-4">
                                    <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center">
                                        <QrCode className="h-5 w-5 text-muted-foreground" />
                                    </div>
                                    <p className="text-sm text-muted-foreground text-center">
                                        Enter the 6-digit code from your authenticator app
                                    </p>
                                    <InputOTP
                                        ref={otpRef}
                                        maxLength={6}
                                        value={verificationCode}
                                        onChange={(value) => {
                                            setVerificationCode(value)
                                            if (value.length === 6) handleVerify(value)
                                        }}
                                        disabled={isPending}
                                        autoFocus
                                    >
                                        <InputOTPGroup>
                                            <InputOTPSlot index={0} className="h-11 w-11 text-lg" />
                                            <InputOTPSlot index={1} className="h-11 w-11 text-lg" />
                                            <InputOTPSlot index={2} className="h-11 w-11 text-lg" />
                                        </InputOTPGroup>
                                        <InputOTPSeparator />
                                        <InputOTPGroup>
                                            <InputOTPSlot index={3} className="h-11 w-11 text-lg" />
                                            <InputOTPSlot index={4} className="h-11 w-11 text-lg" />
                                            <InputOTPSlot index={5} className="h-11 w-11 text-lg" />
                                        </InputOTPGroup>
                                    </InputOTP>
                                </div>
                                <Button
                                    onClick={() => handleVerify()}
                                    disabled={verificationCode.length !== 6 || isPending}
                                    className="w-full"
                                >
                                    {isPending ? (
                                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                                    ) : (
                                        <ShieldCheck className="h-4 w-4 mr-2" />
                                    )}
                                    Enable two-factor authentication
                                </Button>
                            </div>
                        )}
                    </div>
                </DialogContent>
            </Dialog>

            {/* Disable Dialog */}
            <Dialog open={showDisableDialog} onOpenChange={setShowDisableDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <ShieldOff className="h-5 w-5 text-destructive" />
                            Disable Two-Factor Authentication
                        </DialogTitle>
                        <DialogDescription>
                            Enter a code from your authenticator app or a backup code to disable 2FA.
                        </DialogDescription>
                    </DialogHeader>
                    <div className="space-y-2">
                        <Label htmlFor="disable-code">Verification Code</Label>
                        <Input
                            id="disable-code"
                            placeholder="000000 or XXXXX-XXXXXXXXXXX"
                            value={disableCode}
                            onChange={(e) => setDisableCode(e.target.value)}
                            className="font-mono"
                        />
                    </div>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button variant="outline" onClick={() => setShowDisableDialog(false)}>
                            Cancel
                        </Button>
                        <Button
                            variant="destructive"
                            onClick={handleDisable}
                            disabled={!disableCode || isPending}
                        >
                            {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                            Disable 2FA
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>

            {/* Backup Codes Dialog */}
            <Dialog open={showBackupCodesDialog} onOpenChange={setShowBackupCodesDialog}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Key className="h-5 w-5" />
                            Backup Codes
                        </DialogTitle>
                        <DialogDescription>
                            To view or regenerate backup codes, enter a code from your authenticator.
                        </DialogDescription>
                    </DialogHeader>
                    {backupCodes.length > 0 ? (
                        <div className="space-y-4">
                            <div className="rounded-xl border border-border/60 overflow-hidden">
                                <div className="grid grid-cols-2 divide-x divide-border/60">
                                    {backupCodes.map((code, i) => (
                                        <div
                                            key={i}
                                            className={cn(
                                                "flex items-center gap-2.5 px-3.5 py-2.5",
                                                i < backupCodes.length - 2 && "border-b border-border/60",
                                            )}
                                        >
                                            <span className="text-[10px] font-medium text-muted-foreground/60 tabular-nums w-3 text-right">
                                                {i + 1}
                                            </span>
                                            <span className="font-mono text-sm tracking-wide">
                                                {code}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                            <Button
                                variant="outline"
                                onClick={copyBackupCodes}
                                className="w-full"
                                size="sm"
                            >
                                {copiedBackup ? <Check className="h-3.5 w-3.5 mr-2" /> : <Copy className="h-3.5 w-3.5 mr-2" />}
                                Copy all codes
                            </Button>
                        </div>
                    ) : (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <Label htmlFor="regenerate-code">Verification Code</Label>
                                <Input
                                    id="regenerate-code"
                                    placeholder="000000"
                                    value={regenerateCode}
                                    onChange={(e) => setRegenerateCode(e.target.value)}
                                    className="font-mono"
                                />
                            </div>
                            <Button
                                onClick={handleRegenerateBackupCodes}
                                disabled={!regenerateCode || isPending}
                                className="w-full"
                            >
                                {isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                                Generate New Backup Codes
                            </Button>
                        </div>
                    )}
                </DialogContent>
            </Dialog>
        </>
    )
}
