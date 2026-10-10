/**
 * @vitest-environment node
 *
 * "Sign out all other devices" must keep THIS session. It used to read the
 * `better-auth.session_token` cookie by name, which is `__Secure-`-prefixed in
 * production — the lookup came back empty and every session got deleted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    getSession: vi.fn(),
    headers: vi.fn(),
    sessionDeleteMany: vi.fn(),
}))

vi.mock("@/lib/auth", () => ({
    auth: { api: { getSession: mocks.getSession, requestPasswordReset: vi.fn() } },
}))
vi.mock("next/headers", () => ({ headers: mocks.headers, cookies: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/turnstile", () => ({ getTurnstileError: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
    prisma: { session: { deleteMany: mocks.sessionDeleteMany } },
}))
vi.mock("@/lib/safe-action", () => ({
    runSecureAction: async (_opts: unknown, fn: (data: unknown, userId: string) => Promise<unknown>) => {
        try {
            await fn(undefined, "user_1")
            return { success: true }
        } catch (error) {
            return { error: error instanceof Error ? error.message : "Operation failed" }
        }
    },
}))

import { revokeAllOtherSessionsAction } from "@/actions/session"

describe("revokeAllOtherSessionsAction", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.headers.mockResolvedValue(new Headers({ cookie: "__Secure-better-auth.session_token=tok.sig" }))
        mocks.sessionDeleteMany.mockResolvedValue({ count: 2 })
    })

    it("excludes the current session by id resolved through better-auth", async () => {
        mocks.getSession.mockResolvedValue({ session: { id: "sess_current" }, user: { id: "user_1" } })

        const result = await revokeAllOtherSessionsAction()

        expect(result).toEqual({ success: true })
        expect(mocks.sessionDeleteMany).toHaveBeenCalledWith({
            where: { userId: "user_1", id: { not: "sess_current" } },
        })
    })

    it("deletes nothing when the current session cannot be resolved", async () => {
        mocks.getSession.mockResolvedValue(null)

        const result = await revokeAllOtherSessionsAction()

        expect(result.error).toBeTruthy()
        expect(mocks.sessionDeleteMany).not.toHaveBeenCalled()
    })
})
