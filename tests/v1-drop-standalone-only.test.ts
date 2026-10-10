/**
 * @vitest-environment node
 *
 * The public drop API manages standalone drops only, matching
 * GET /api/v1/drop: DELETE and PATCH ?action=toggle ask DropService for the
 * standalone surface, so form attachment/staging and soft-deleted drops 404.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const context = {
    userId: "user-1",
    requestId: "req-standalone",
    organizationId: null,
    orgRole: null,
    rateLimitHeaders: null,
}

const deleteDrop = vi.fn()
const toggleDrop = vi.fn()

vi.mock("@/lib/route-policy", () => ({
    withPolicy: (
        _policy: unknown,
        handler: (ctx: typeof context & { request: Request }, routeContext: unknown) => Promise<Response>,
    ) => (request: Request, routeContext: unknown) => handler({ ...context, request }, routeContext),
    scopeFromContext: (ctx: typeof context) => ({
        userId: ctx.userId,
        organizationId: ctx.organizationId,
        role: ctx.orgRole,
    }),
}))

vi.mock("@/lib/services/drop", () => ({ DropService: { deleteDrop, toggleDrop } }))
vi.mock("@/lib/services/form-upload", () => ({
    resolveTokenUploadAccess: vi.fn(),
    scopeForTokenUploadAccess: vi.fn(),
}))
vi.mock("@/lib/drop-metadata", () => ({ getPublicDropMetadata: vi.fn() }))
vi.mock("@/lib/rate-limit", () => ({ getClientIp: vi.fn(), rateLimit: vi.fn() }))

const routeContext = { params: Promise.resolve({ id: "drop-1" }) }
const personal = { userId: "user-1", organizationId: null, role: null }

describe("/api/v1/drop/[id] standalone-only mutations", () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("DELETE restricts the delete to standalone drops", async () => {
        deleteDrop.mockResolvedValueOnce(undefined)
        const { DELETE } = await import("@/app/api/v1/drop/[id]/route")
        const response = await DELETE(new Request("https://anon.li/api/v1/drop/drop-1", { method: "DELETE" }), routeContext)
        expect(response.status).toBe(200)
        expect(deleteDrop).toHaveBeenCalledWith("drop-1", personal, { standaloneOnly: true })
    })

    it("PATCH ?action=toggle restricts the toggle to standalone drops", async () => {
        toggleDrop.mockResolvedValueOnce(true)
        const { PATCH } = await import("@/app/api/v1/drop/[id]/route")
        const response = await PATCH(
            new Request("https://anon.li/api/v1/drop/drop-1?action=toggle", { method: "PATCH" }),
            routeContext,
        )
        expect(response.status).toBe(200)
        await expect(response.json()).resolves.toEqual({ success: true, disabled: true })
        expect(toggleDrop).toHaveBeenCalledWith("drop-1", personal, { standaloneOnly: true })
    })
})
