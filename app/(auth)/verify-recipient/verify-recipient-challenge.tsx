"use client"

import { useState, useTransition } from "react"
import { MailCheck } from "lucide-react"
import { verifyRecipientByTokenAction, type RecipientVerificationResult } from "@/actions/recipient-verification"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Turnstile } from "@/components/ui/turnstile"
import { VerifyRecipientResultCard } from "./verify-recipient-result"

const TURNSTILE_REQUIRED_MESSAGE = "Verification required. Please complete the challenge."
const TURNSTILE_FAILED_MESSAGE = "Bot verification failed. Please try again."

export function VerifyRecipientChallenge({ token, siteKey }: { token: string; siteKey: string }) {
    const [turnstileToken, setTurnstileToken] = useState<string | null>(null)
    const [turnstileRequested, setTurnstileRequested] = useState(false)
    const [turnstileRenderKey, setTurnstileRenderKey] = useState(0)
    const [result, setResult] = useState<RecipientVerificationResult | null>(null)
    const [error, setError] = useState<string | null>(null)
    const [isPending, startTransition] = useTransition()

    const resetTurnstile = () => {
        setTurnstileToken(null)
        setTurnstileRenderKey((key) => key + 1)
    }

    const submitVerification = (verifiedToken?: string) => {
        const tokenForSubmit = verifiedToken ?? turnstileToken
        if (!tokenForSubmit) {
            setTurnstileRequested(true)
            setError(null)
            return
        }

        setError(null)
        startTransition(async () => {
            const verification = await verifyRecipientByTokenAction(token, tokenForSubmit)
            resetTurnstile()

            if (
                verification.status === "error"
                && (verification.message === TURNSTILE_REQUIRED_MESSAGE || verification.message === TURNSTILE_FAILED_MESSAGE)
            ) {
                setError(verification.message)
                return
            }

            setResult(verification)
        })
    }

    const handleTurnstileVerify = (verifiedToken: string) => {
        setTurnstileToken(verifiedToken)
        setTurnstileRequested(false)
        submitVerification(verifiedToken)
    }

    const handleVerify = () => {
        submitVerification()
    }

    if (result) {
        return <VerifyRecipientResultCard result={result} />
    }

    return (
        <Card className="w-full max-w-md">
            <CardHeader className="text-center">
                <MailCheck className="mx-auto h-12 w-12 text-primary" />
                <CardTitle className="mt-4">Verify Recipient</CardTitle>
                <CardDescription>
                    Complete the challenge to verify this forwarding address.
                </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                {turnstileRequested ? (
                    <Turnstile
                        key={turnstileRenderKey}
                        siteKey={siteKey}
                        onVerify={handleTurnstileVerify}
                        onError={resetTurnstile}
                        onExpire={() => setTurnstileToken(null)}
                    />
                ) : null}

                {error && (
                    <div className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive">
                        {error}
                    </div>
                )}

                <Button
                    type="button"
                    className="w-full"
                    onClick={handleVerify}
                    disabled={isPending || (turnstileRequested && !turnstileToken)}
                >
                    {isPending ? "Verifying..." : "Verify Email"}
                </Button>
            </CardContent>
        </Card>
    )
}
