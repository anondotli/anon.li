import { createAuthClient } from "better-auth/react"
import { magicLinkClient, twoFactorClient, organizationClient } from "better-auth/client/plugins"
import { ac, roles } from "@/lib/auth-permissions"

export const authClient = createAuthClient({
    plugins: [
        magicLinkClient(),
        twoFactorClient({
            onTwoFactorRedirect: () => {
                // Keep the post-login destination; /2fa sanitizes it server-side.
                const callbackUrl = new URLSearchParams(window.location.search).get("callbackUrl")
                window.location.replace(callbackUrl ? `/2fa?callbackUrl=${encodeURIComponent(callbackUrl)}` : "/2fa")
            },
        }),
        organizationClient({
            ac,
            roles,
        }),
    ],
})
