"use client"

import { authClient } from "@/lib/auth-client"
import { SiteNav } from "@/components/layout/nav"

// Client-side session check so the marketing layout can be statically
// prerendered. Logged-in users see a brief moment of "logged out" nav before
// the session resolves; logged-out users (the vast majority of marketing
// traffic) see no transition at all.
export function SiteHeader() {
    const { data: session, isPending } = authClient.useSession()
    return <SiteNav isLoggedIn={!isPending && Boolean(session?.user)} />
}

export function SiteHeaderFallback() {
    return <SiteNav />
}
