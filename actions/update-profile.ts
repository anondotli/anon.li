"use server"

import { runSecureAction } from "@/lib/safe-action"
import { UserService } from "@/lib/services/user"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const DISPLAY_NAME_MIN_LENGTH = 2
const DISPLAY_NAME_MAX_LENGTH = 50

const updateProfileSchema = z.object({
    name: z
        .string({ error: "Display name is required" })
        .trim()
        .min(DISPLAY_NAME_MIN_LENGTH, `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} characters`)
        .max(DISPLAY_NAME_MAX_LENGTH, `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`),
})


export type State = {
    readonly message: string
    readonly status: "success" | "error"
    /** The submitted name, echoed back so the form can keep it after React resets it. */
    readonly name?: string
} | null

export async function updateProfile(_prevState: State, formData: FormData): Promise<State> {
    // Validate here (not via the wrapper's schema) to return a field-specific
    // message and echo the input back; auth, 2FA, ban and rate-limiting are
    // delegated to runSecureAction.
    const rawName = formData.get("name")
    const submittedName = typeof rawName === "string" ? rawName : ""
    const validatedFields = updateProfileSchema.safeParse({
        name: typeof rawName === "string" ? rawName : undefined,
    })
    if (!validatedFields.success) {
        return {
            message: validatedFields.error.issues[0]?.message ?? "Invalid display name",
            status: "error",
            name: submittedName,
        }
    }

    const result = await runSecureAction(
        { rateLimitKey: "profileUpdate" },
        async (_data, userId) => {
            await UserService.updateProfile(userId, { name: validatedFields.data.name })
            revalidatePath("/dashboard/settings")
        },
    )

    if (result.error) {
        return { message: result.error, status: "error", name: submittedName }
    }
    return { message: "Profile updated successfully", status: "success", name: validatedFields.data.name }
}
