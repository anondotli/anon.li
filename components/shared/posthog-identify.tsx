"use client"

import { useEffect, useRef } from "react"
import posthog from "posthog-js"
import { authClient } from "@/lib/auth-client"

/**
 * Ties PostHog events to the signed-in user by internal userId only — never email
 * or other PII. Mounted in the authenticated app layout. Resets only on a real
 * sign-out (identify → null transition) so it doesn't wipe the anonymous id while
 * the session is still loading.
 */
export function PostHogIdentify() {
    const { data: session } = authClient.useSession()
    const userId = session?.user?.id
    const identified = useRef(false)

    useEffect(() => {
        if (!process.env.NEXT_PUBLIC_POSTHOG_KEY) return
        if (userId) {
            posthog.identify(userId)
            identified.current = true
        } else if (identified.current) {
            posthog.reset()
            identified.current = false
        }
    }, [userId])

    return null
}
