/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { redisSet, redisEval, loggerError } = vi.hoisted(() => ({
    redisSet: vi.fn(),
    redisEval: vi.fn(),
    loggerError: vi.fn(),
}))

vi.mock("@/lib/rate-limit", () => ({
    redis: {
        set: redisSet,
        eval: redisEval,
    },
}))

vi.mock("@/lib/logger", () => ({
    createLogger: () => ({
        error: loggerError,
        info: vi.fn(),
    }),
}))

import { withCronLock } from "@/lib/cron-lock"

describe("withCronLock", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        redisEval.mockResolvedValue(1)
    })

    it("refuses to run destructive work when the lock backend is unavailable", async () => {
        const outage = new Error("Redis unavailable")
        const job = vi.fn()
        redisSet.mockRejectedValue(outage)

        await expect(withCronLock("cleanup", 60, job)).rejects.toBe(outage)
        expect(job).not.toHaveBeenCalled()
    })

    it("skips work when another worker owns the lock", async () => {
        const job = vi.fn()
        redisSet.mockResolvedValue(null)

        await expect(withCronLock("cleanup", 60, job)).resolves.toBeNull()
        expect(job).not.toHaveBeenCalled()
        expect(redisEval).not.toHaveBeenCalled()
    })

    it("runs under the lock and releases ownership atomically", async () => {
        redisSet.mockResolvedValue("OK")

        await expect(withCronLock("cleanup", 60, async () => "done")).resolves.toBe("done")

        expect(redisEval).toHaveBeenCalledOnce()
        const [script, keys, args] = redisEval.mock.calls[0] ?? []
        expect(script).toContain('redis.call("get", KEYS[1])')
        expect(keys).toEqual(["cron-lock:cleanup"])
        expect(args).toHaveLength(1)
        expect(typeof args?.[0]).toBe("string")
    })
})
