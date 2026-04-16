"use client"

import * as React from "react"
import { UnlockPrompt } from "@/components/vault/unlock-prompt"
import { useVault } from "@/components/vault/vault-provider"

const SUCCESS_STATE_DURATION_MS = 800

export function VaultGate({ children }: { children: React.ReactNode }) {
    const { status } = useVault()
    const [showUnlockedContent, setShowUnlockedContent] = React.useState(status === "unlocked")

    React.useEffect(() => {
        if (status === "unlocked") {
            const timer = window.setTimeout(() => {
                setShowUnlockedContent(true)
            }, SUCCESS_STATE_DURATION_MS)

            return () => window.clearTimeout(timer)
        }

        setShowUnlockedContent(false)
    }, [status])

    if (!showUnlockedContent) {
        return <UnlockPrompt />
    }

    return <>{children}</>
}
