/**
 * @vitest-environment node
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const updateProfile = vi.fn()
const revalidatePath = vi.fn()
const runSecureAction = vi.fn()

vi.mock("@/lib/safe-action", () => ({ runSecureAction }))
vi.mock("@/lib/services/user", () => ({ UserService: { updateProfile } }))
vi.mock("next/cache", () => ({ revalidatePath }))

function form(name?: string) {
    const fd = new FormData()
    if (name !== undefined) fd.set("name", name)
    return fd
}

describe("updateProfile action", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        runSecureAction.mockImplementation(async (_opts: unknown, handler: (d: undefined, userId: string) => Promise<unknown>) => {
            await handler(undefined, "user-1")
            return {}
        })
    })

    it("returns a specific message and echoes the input when the name is too short", async () => {
        const { updateProfile: action } = await import("@/actions/update-profile")

        const state = await action(null, form("a"))

        expect(state).toEqual({
            status: "error",
            message: "Display name must be at least 2 characters",
            name: "a",
        })
        expect(runSecureAction).not.toHaveBeenCalled()
        expect(updateProfile).not.toHaveBeenCalled()
    })

    it("rejects names longer than 50 characters", async () => {
        const { updateProfile: action } = await import("@/actions/update-profile")
        const long = "x".repeat(51)

        const state = await action(null, form(long))

        expect(state).toEqual({
            status: "error",
            message: "Display name must be at most 50 characters",
            name: long,
        })
    })

    it("rejects a missing name field", async () => {
        const { updateProfile: action } = await import("@/actions/update-profile")

        const state = await action(null, form())

        expect(state?.status).toBe("error")
        expect(state?.message).toBe("Display name is required")
        expect(updateProfile).not.toHaveBeenCalled()
    })

    it("trims and saves a valid name", async () => {
        const { updateProfile: action } = await import("@/actions/update-profile")

        const state = await action(null, form("  Jane Doe  "))

        expect(updateProfile).toHaveBeenCalledWith("user-1", { name: "Jane Doe" })
        expect(state).toEqual({ status: "success", message: "Profile updated successfully", name: "Jane Doe" })
    })

    it("surfaces wrapper errors and keeps the submitted value", async () => {
        runSecureAction.mockResolvedValueOnce({ error: "Too many requests. Please try again later." })
        const { updateProfile: action } = await import("@/actions/update-profile")

        const state = await action(null, form("Jane"))

        expect(state).toEqual({
            status: "error",
            message: "Too many requests. Please try again later.",
            name: "Jane",
        })
    })
})
