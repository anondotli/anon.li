import { createAuthClient } from "better-auth/react"
import { magicLinkClient, twoFactorClient, organizationClient } from "better-auth/client/plugins"
import { ac, roles } from "@/lib/auth-permissions"

export const authClient = createAuthClient({
    plugins: [
        magicLinkClient(),
        twoFactorClient({
            onTwoFactorRedirect: () => {
                window.location.href = "/2fa"
            },
        }),
        organizationClient({
            ac,
            roles,
        }),
    ],
})
