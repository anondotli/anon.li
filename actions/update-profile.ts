"use server"

import { auth } from "@/auth"
import { getAuthUserState } from "@/lib/data/auth"
import { UserService } from "@/lib/services/user"
import { revalidatePath } from "next/cache"
import { z } from "zod"
import { rateLimit } from "@/lib/rate-limit"

const updateProfileSchema = z.object({
    name: z.string().min(2).max(50),
})


export type State = {
    readonly message: string
    readonly status: "success" | "error"
} | null

export async function updateProfile(_prevState: State, formData: FormData): Promise<State> {
    const session = await auth()

    if (!session?.user?.id) {
        return { message: "Unauthorized", status: "error" }
    }

    if (session.user.twoFactorEnabled && !session.twoFactorVerified) {
        return { message: "Two-factor authentication required", status: "error" }
    }

    const user = await getAuthUserState(session.user.id)
    if (user?.banned) {
        return { message: "Account suspended", status: "error" }
    }

    // Rate limit check
    const rateLimited = await rateLimit("profileUpdate", session.user.id)
    if (rateLimited) {
        return { message: "Too many requests. Please try again later.", status: "error" }
    }

    const validatedFields = updateProfileSchema.safeParse({
        name: formData.get("name"),
    })

    if (!validatedFields.success) {
        return { message: "Invalid fields", status: "error" }
    }

    try {
        await UserService.updateProfile(session.user.id, {
            name: validatedFields.data.name,
        })

        revalidatePath("/dashboard/settings")
        return { message: "Profile updated successfully", status: "success" }
    } catch {
        return { message: "Failed to update profile", status: "error" }
    }
}
