"use server"

import { revalidatePath } from "next/cache"
import { RecipientService } from "@/lib/services/recipient"
import { type ActionState, runScopedAction } from "@/lib/safe-action"

export async function setDefaultRecipient(recipientId: string): Promise<ActionState> {
    return runScopedAction({ rateLimitKey: "recipientOps" }, async (_, scope) => {
        await RecipientService.setAsDefault(scope, recipientId)
        revalidatePath("/dashboard/alias/recipients")
    })
}

export async function addRecipientAction(email: string): Promise<ActionState> {
    return runScopedAction({ rateLimitKey: "recipientOps" }, async (_, scope) => {
        await RecipientService.addRecipient(scope, email)
        revalidatePath("/dashboard/alias/recipients")
    })
}

export async function deleteRecipientAction(recipientId: string): Promise<ActionState> {
    return runScopedAction({ rateLimitKey: "recipientOps" }, async (_, scope) => {
        await RecipientService.deleteRecipient(scope, recipientId)
        revalidatePath("/dashboard/alias/recipients")
    })
}

export async function resendVerificationAction(recipientId: string): Promise<ActionState> {
    return runScopedAction({ rateLimitKey: "emailResend" }, async (_, scope) => {
        await RecipientService.resendVerification(scope, recipientId)
    })
}

export async function setPgpKeyAction(recipientId: string, publicKey: string, name?: string): Promise<ActionState> {
    return runScopedAction({ rateLimitKey: "pgpOps" }, async (_, scope) => {
        await RecipientService.setPgpKey(scope, recipientId, publicKey, name)
        revalidatePath("/dashboard/alias/recipients")
    })
}

export async function removePgpKeyAction(recipientId: string): Promise<ActionState> {
    return runScopedAction({ rateLimitKey: "pgpOps" }, async (_, scope) => {
        await RecipientService.removePgpKey(scope, recipientId)
        revalidatePath("/dashboard/alias/recipients")
    })
}
