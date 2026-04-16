import { createAuthClient } from "better-auth/react"
import { magicLinkClient, twoFactorClient } from "better-auth/client/plugins"

export const authClient = createAuthClient({
    plugins: [
        magicLinkClient(),
        twoFactorClient({
            onTwoFactorRedirect: () => {
                window.location.href = "/2fa"
            },
        }),
    ],
})
