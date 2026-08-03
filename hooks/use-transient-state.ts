"use client"

import { useCallback, useEffect, useRef, useState } from "react"

export function useTransientState<T>(initialValue: T) {
    const [value, setValue] = useState<T>(initialValue)
    const initialValueRef = useRef(initialValue)
    const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

    const clear = useCallback(() => {
        if (timeoutRef.current !== null) {
            clearTimeout(timeoutRef.current)
            timeoutRef.current = null
        }
    }, [])

    useEffect(() => clear, [clear])

    const setTransientValue = useCallback((nextValue: T, durationMs: number) => {
        clear()
        setValue(nextValue)
        timeoutRef.current = setTimeout(() => {
            timeoutRef.current = null
            setValue(initialValueRef.current)
        }, durationMs)
    }, [clear])

    const reset = useCallback(() => {
        clear()
        setValue(initialValueRef.current)
    }, [clear])

    return { value, setTransientValue, reset }
}
