"use client"

import { useCallback, useEffect, useRef, useState } from "react"

/**
 * Copy text to the clipboard and track a transient "copied" state that
 * auto-resets after `resetMs`. Replaces the copied-boolean + setTimeout pattern
 * that was duplicated across every copy button, and clears its timer on unmount
 * (the hand-rolled versions leaked it).
 *
 * `copy` resolves to whether the write succeeded so callers can branch on it
 * (e.g. show a success vs. error toast). For independent copy buttons in one
 * component, call the hook once per button.
 */
export function useClipboard(resetMs = 2000) {
    const [copied, setCopied] = useState(false)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clear = useCallback(() => {
        if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }, [])

    useEffect(() => clear, [clear])

    const copy = useCallback(
        async (text: string): Promise<boolean> => {
            try {
                await navigator.clipboard.writeText(text)
                setCopied(true)
                clear()
                timeoutRef.current = setTimeout(() => setCopied(false), resetMs)
                return true
            } catch {
                return false
            }
        },
        [clear, resetMs],
    )

    const reset = useCallback(() => {
        clear()
        setCopied(false)
    }, [clear])

    return { copied, copy, reset }
}
