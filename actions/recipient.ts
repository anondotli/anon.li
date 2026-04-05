"use server"

import { revalidatePath } from "next/cache"
import { RecipientService } from "@/lib/services/recipient"
import { type ActionState, runSecureAction } from "@/lib/safe-action"

export async function setDefaultRecipient(recipientId: string): Promise<ActionState> {
    return runSecureAction({ rateLimitKey: "recipientOps" }, async (_, userId) => {
        await RecipientService.setAsDefault(userId, recipientId)
        revalidatePath("/dashboard/alias/recipients")
    })
}

export async function addRecipientAction(email: string): Promise<ActionState> {
    return runSecureAction({ rateLimitKey: "recipientOps" }, async (_, userId) => {
        await RecipientService.addRecipient(userId, email)
        revalidatePath("/dashboard/alias/recipients")
    })
}

export async function deleteRecipientAction(recipientId: string): Promise<ActionState> {
    return runSecureAction({ rateLimitKey: "recipientOps" }, async (_, userId) => {
        await RecipientService.deleteRecipient(userId, recipientId)
        revalidatePath("/dashboard/alias/recipients")
    })
}

export async function resendVerificationAction(recipientId: string): Promise<ActionState> {
    return runSecureAction({ rateLimitKey: "emailResend" }, async (_, userId) => {
        await RecipientService.resendVerification(userId, recipientId)
    })
}

export async function setPgpKeyAction(recipientId: string, publicKey: string, name?: string): Promise<ActionState> {
    return runSecureAction({ rateLimitKey: "pgpOps" }, async (_, userId) => {
        await RecipientService.setPgpKey(userId, recipientId, publicKey, name)
        revalidatePath("/dashboard/alias/recipients")
    })
}

export async function removePgpKeyAction(recipientId: string): Promise<ActionState> {
    return runSecureAction({ rateLimitKey: "pgpOps" }, async (_, userId) => {
        await RecipientService.removePgpKey(userId, recipientId)
        revalidatePath("/dashboard/alias/recipients")
    })
}
