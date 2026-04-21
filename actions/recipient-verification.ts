"use server"

import { RecipientService } from "@/lib/services/recipient"
import { getTurnstileError } from "@/lib/turnstile"

export type RecipientVerificationResult =
    | { status: "already-verified"; email: string }
    | { status: "success"; email: string }
    | { status: "error"; message: string; isExpired: boolean }

export async function verifyRecipientByTokenAction(
    token: string,
    turnstileToken?: string,
): Promise<RecipientVerificationResult> {
    if (!token) {
        return { status: "error", message: "This verification link is invalid or missing.", isExpired: false }
    }

    const turnstileError = await getTurnstileError(turnstileToken)
    if (turnstileError) {
        return { status: "error", message: turnstileError, isExpired: false }
    }

    try {
        const verifyResult = await RecipientService.verifyByToken(token)

        if (verifyResult.alreadyVerified) {
            return { status: "already-verified", email: verifyResult.recipient.email }
        }

        return { status: "success", email: verifyResult.recipient.email }
    } catch (error) {
        const message = error instanceof Error ? error.message : "Verification failed"
        return { status: "error", message, isExpired: message.includes("expired") }
    }
}
