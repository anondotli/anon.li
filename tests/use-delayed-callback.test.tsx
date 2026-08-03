/** @vitest-environment jsdom */
import { act, renderHook } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"

import { useDelayedCallback } from "@/hooks/use-delayed-callback"

afterEach(() => {
    vi.useRealTimers()
})

describe("useDelayedCallback", () => {
    it("runs only the latest scheduled callback", () => {
        vi.useFakeTimers()
        const callback = vi.fn()
        const { result } = renderHook(() => useDelayedCallback(callback, 220))

        act(() => {
            result.current.schedule()
            vi.advanceTimersByTime(100)
            result.current.schedule()
            vi.advanceTimersByTime(219)
        })
        expect(callback).not.toHaveBeenCalled()

        act(() => vi.advanceTimersByTime(1))
        expect(callback).toHaveBeenCalledOnce()
    })

    it("cancels pending work when the component unmounts", () => {
        vi.useFakeTimers()
        const callback = vi.fn()
        const { result, unmount } = renderHook(() => useDelayedCallback(callback, 220))

        act(() => result.current.schedule())
        unmount()
        act(() => vi.runAllTimers())

        expect(callback).not.toHaveBeenCalled()
    })
})
