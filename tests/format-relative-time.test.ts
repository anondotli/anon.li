import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { formatRelativeTime } from "@/lib/format"

const NOW = new Date("2026-01-15T12:00:00Z").getTime()
const MINUTE = 60_000
const HOUR = 60 * MINUTE
const DAY = 24 * HOUR

describe("formatRelativeTime", () => {
    beforeEach(() => {
        vi.useFakeTimers()
        vi.setSystemTime(NOW)
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it("formats past dates", () => {
        expect(formatRelativeTime(NOW - 10_000)).toBe("just now")
        expect(formatRelativeTime(NOW - 5 * MINUTE)).toBe("5 minutes ago")
        expect(formatRelativeTime(NOW - 2 * HOUR)).toBe("2 hours ago")
        expect(formatRelativeTime(NOW - DAY)).toBe("yesterday")
        expect(formatRelativeTime(new Date(NOW - 3 * DAY))).toBe("3 days ago")
        expect(formatRelativeTime(new Date(NOW - 3 * DAY).toISOString())).toBe("3 days ago")
    })

    it("formats future dates instead of collapsing them to 'just now'", () => {
        expect(formatRelativeTime(NOW + 10_000)).toBe("in less than a minute")
        expect(formatRelativeTime(NOW + 5 * MINUTE)).toBe("in 5 minutes")
        expect(formatRelativeTime(NOW + 2 * HOUR)).toBe("in 2 hours")
        expect(formatRelativeTime(NOW + DAY)).toBe("tomorrow")
        expect(formatRelativeTime(new Date(NOW + 3 * DAY))).toBe("in 3 days")
        expect(formatRelativeTime(NOW + 2 * 7 * DAY)).toBe("in 2 weeks")
    })

    it("treats the exact current instant as 'just now'", () => {
        expect(formatRelativeTime(NOW)).toBe("just now")
    })
})
