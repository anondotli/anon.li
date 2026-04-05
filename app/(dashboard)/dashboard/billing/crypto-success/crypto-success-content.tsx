"use client"

import { useEffect, useState, useMemo } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { CheckCircle2, Clock, Loader2, XCircle } from "lucide-react"

interface CryptoSuccessContentProps {
    orderId: string
}

type PaymentStatus = "waiting" | "confirming" | "confirmed" | "sending" | "finished" | "failed" | "expired" | "refunded"

const STATUS_STEPS: { key: PaymentStatus[]; label: string }[] = [
    { key: ["waiting"], label: "Waiting for payment" },
    { key: ["confirming"], label: "Confirming transaction" },
    { key: ["confirmed", "sending"], label: "Payment confirmed" },
    { key: ["finished"], label: "Subscription active" },
]

function getStepIndex(status: PaymentStatus): number {
    return STATUS_STEPS.findIndex(step => step.key.includes(status))
}

function isTerminalSuccess(status: PaymentStatus): boolean {
    return status === "finished" || status === "confirmed" || status === "sending"
}

function isTerminalFailure(status: PaymentStatus): boolean {
    return status === "failed" || status === "expired" || status === "refunded"
}

export function CryptoSuccessContent({ orderId }: CryptoSuccessContentProps) {
    const router = useRouter()
    const [status, setStatus] = useState<PaymentStatus>("waiting")

    const error = isTerminalFailure(status)
    const success = isTerminalSuccess(status)

    // Poll for payment status updates
    useEffect(() => {
        if (isTerminalSuccess(status) || isTerminalFailure(status)) return

        let cancelled = false

        async function fetchStatus() {
            try {
                const res = await fetch(`/api/crypto/status?orderId=${encodeURIComponent(orderId)}`)
                if (!res.ok || cancelled) return
                const data = await res.json()
                if (!cancelled) {
                    setStatus(data.status as PaymentStatus)
                }
            } catch {
                // Silently retry on network error
            }
        }

        fetchStatus()
        const interval = setInterval(fetchStatus, 5000)

        return () => {
            cancelled = true
            clearInterval(interval)
        }
    }, [orderId, status])

    // Auto-redirect on success
    useEffect(() => {
        if (!success) return
        const timeout = setTimeout(() => {
            router.push("/dashboard/billing?crypto-success=true")
        }, 3000)
        return () => clearTimeout(timeout)
    }, [success, router])

    const currentStep = useMemo(() => getStepIndex(status), [status])

    if (error) {
        return (
            <div className="flex items-center justify-center min-h-[60vh]">
                <Card className="w-full max-w-md rounded-3xl">
                    <CardContent className="p-8 text-center space-y-4">
                        <XCircle className="h-12 w-12 text-destructive mx-auto" />
                        <h2 className="text-xl font-medium font-serif">Payment {status === "refunded" ? "Refunded" : status === "expired" ? "Expired" : "Failed"}</h2>
                        <p className="text-muted-foreground">
                            {status === "expired"
                                ? "The payment window has expired. Please try again."
                                : status === "refunded"
                                    ? "Your payment has been refunded."
                                    : "Something went wrong with your payment. Please try again."}
                        </p>
                        <Button onClick={() => router.push("/dashboard/billing")} className="w-full">
                            Try Again
                        </Button>
                    </CardContent>
                </Card>
            </div>
        )
    }

    return (
        <div className="flex items-center justify-center min-h-[60vh]">
            <Card className="w-full max-w-md rounded-3xl">
                <CardContent className="p-8 space-y-6">
                    <div className="text-center space-y-2">
                        {success ? (
                            <CheckCircle2 className="h-12 w-12 text-green-500 mx-auto" />
                        ) : (
                            <Loader2 className="h-12 w-12 text-primary mx-auto animate-spin" />
                        )}
                        <h2 className="text-xl font-medium font-serif">
                            {success ? "Payment Confirmed!" : "Processing Payment"}
                        </h2>
                        {success && (
                            <p className="text-sm text-muted-foreground">Redirecting to billing...</p>
                        )}
                    </div>

                    <div className="space-y-3">
                        {STATUS_STEPS.map((step, index) => {
                            const isActive = index === currentStep
                            const isComplete = index < currentStep || success

                            return (
                                <div key={step.label} className="flex items-center gap-3">
                                    <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                                        isComplete
                                            ? "bg-green-500 text-white"
                                            : isActive
                                                ? "bg-primary text-primary-foreground"
                                                : "bg-muted text-muted-foreground"
                                    }`}>
                                        {isComplete ? (
                                            <CheckCircle2 className="h-4 w-4" />
                                        ) : isActive ? (
                                            <Clock className="h-4 w-4" />
                                        ) : (
                                            index + 1
                                        )}
                                    </div>
                                    <span className={`text-sm ${
                                        isComplete || isActive ? "text-foreground" : "text-muted-foreground"
                                    }`}>
                                        {step.label}
                                    </span>
                                </div>
                            )
                        })}
                    </div>
                </CardContent>
            </Card>
        </div>
    )
}
