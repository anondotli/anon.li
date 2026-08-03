"use client"

import { useCallback, useEffect, useRef } from "react"

export function useDelayedCallback(callback: (() => void) | undefined, delayMs: number) {
    const callbackRef = useRef(callback)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    useEffect(() => {
        callbackRef.current = callback
    }, [callback])

    const cancel = useCallback(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }, [])

    useEffect(() => cancel, [cancel])

    const schedule = useCallback(() => {
        cancel()
        if (!callbackRef.current) return
        timeoutRef.current = setTimeout(() => {
            timeoutRef.current = null
            callbackRef.current?.()
        }, delayMs)
    }, [cancel, delayMs])

    return { schedule, cancel }
}
