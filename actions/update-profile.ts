"use server"

import { runSecureAction } from "@/lib/safe-action"
import { UserService } from "@/lib/services/user"
import { revalidatePath } from "next/cache"
import { z } from "zod"

const updateProfileSchema = z.object({
    name: z.string().min(2).max(50),
})


export type State = {
    readonly message: string
    readonly status: "success" | "error"
} | null

export async function updateProfile(_prevState: State, formData: FormData): Promise<State> {
    // Validate here (not via the wrapper's schema) to keep the form's "Invalid
    // fields" copy; auth, 2FA, ban and rate-limiting are delegated to runSecureAction.
    const validatedFields = updateProfileSchema.safeParse({
        name: formData.get("name"),
    })
    if (!validatedFields.success) {
        return { message: "Invalid fields", status: "error" }
    }

    const result = await runSecureAction(
        { rateLimitKey: "profileUpdate" },
        async (_data, userId) => {
            await UserService.updateProfile(userId, { name: validatedFields.data.name })
            revalidatePath("/dashboard/settings")
        },
    )

    if (result.error) {
        return { message: result.error, status: "error" }
    }
    return { message: "Profile updated successfully", status: "success" }
}
