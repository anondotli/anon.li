import { cache } from "react"
import { auth } from "@/lib/auth"
import { getAuthUserState } from "@/lib/data/auth"
import { headers } from "next/headers"

interface AppSession {
    user: {
        id: string
        name?: string | null
        email?: string | null
        image?: string | null
        isAdmin: boolean
        twoFactorEnabled: boolean
    }
    twoFactorVerified: boolean
}

async function getSessionInternal(): Promise<AppSession | null> {
    // headers() opts into dynamic rendering — must be called before any
    // early return so Next.js never statically pre-renders auth-gated pages.
    const h = await headers()

    if (process.env.NEXT_PHASE === "phase-production-build") return null

    const result = await auth.api.getSession({ headers: h })
    if (!result?.user) return null
    const authUser = await getAuthUserState(result.user.id)
    if (!authUser) return null

    return {
        user: {
            id: result.user.id,
            name: result.user.name,
            email: result.user.email,
            image: result.user.image,
            isAdmin: authUser.isAdmin,
            twoFactorEnabled: result.user.twoFactorEnabled ?? false,
        },
        twoFactorVerified: result.session.twoFactorVerified ?? false,
    }
}

export const getSession = cache(getSessionInternal)
