"use client"

import * as React from "react"
import { UnlockPrompt } from "@/components/vault/unlock-prompt"
import { useVault } from "@/components/vault/vault-provider"

const SUCCESS_STATE_DURATION_MS = 800

export function VaultGate({ children }: { children: React.ReactNode }) {
    const { status } = useVault()
    const [delayedReady, setDelayedReady] = React.useState(status === "unlocked")
    const [prevStatus, setPrevStatus] = React.useState(status)

    if (status !== prevStatus) {
        setPrevStatus(status)
        if (status !== "unlocked") setDelayedReady(false)
    }

    React.useEffect(() => {
        if (status !== "unlocked") return
        const timer = window.setTimeout(() => setDelayedReady(true), SUCCESS_STATE_DURATION_MS)
        return () => window.clearTimeout(timer)
    }, [status])

    if (status !== "unlocked" || !delayedReady) {
        return <UnlockPrompt />
    }

    return <>{children}</>
}
