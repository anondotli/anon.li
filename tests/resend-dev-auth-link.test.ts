import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// vitest.setup.ts mocks @/lib/resend globally; this file tests the real module.
vi.unmock("@/lib/resend")

const send = vi.hoisted(() => vi.fn())
vi.mock("resend", () => ({
    Resend: class {
        emails = { send }
    },
}))

const URL_WITH_TOKEN = "http://localhost:3000/api/auth/magic-link/verify?token=abc123def456&callbackURL=%2Fdashboard"

describe("auth link emails outside production", () => {
    let stdout: ReturnType<typeof vi.spyOn>

    beforeEach(() => {
        vi.resetModules()
        send.mockReset()
        process.env.AUTH_RESEND_KEY = "re_test"
        stdout = vi.spyOn(process.stdout, "write").mockImplementation(() => true)
    })

    afterEach(() => {
        stdout.mockRestore()
        vi.unstubAllEnvs()
    })

    it("prints the magic link unredacted so local sign-in works", async () => {
        vi.stubEnv("NODE_ENV", "development")
        send.mockResolvedValue({ data: { id: "1" }, error: null })
        const { sendMagicLinkEmail } = await import("@/lib/resend")
        await sendMagicLinkEmail("dev@example.com", URL_WITH_TOKEN, "localhost")
        expect(stdout).toHaveBeenCalledWith(`[dev] Magic sign-in link for dev@example.com: ${URL_WITH_TOKEN}\n`)
    })

    it("does not fail a local magic-link sign-in when delivery fails", async () => {
        vi.stubEnv("NODE_ENV", "development")
        send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "API key is invalid" } })
        const { sendMagicLinkEmail } = await import("@/lib/resend")
        await expect(sendMagicLinkEmail("dev@example.com", URL_WITH_TOKEN, "localhost")).resolves.toMatchObject({ success: false })
    })

    it("never prints links and still fails loudly in production", async () => {
        vi.stubEnv("NODE_ENV", "production")
        send.mockResolvedValue({ data: null, error: { name: "validation_error", message: "API key is invalid" } })
        const { sendMagicLinkEmail } = await import("@/lib/resend")
        await expect(sendMagicLinkEmail("dev@example.com", URL_WITH_TOKEN, "localhost")).rejects.toMatchObject({ name: "validation_error" })
        expect(stdout).not.toHaveBeenCalledWith(expect.stringContaining("[dev]"))
    })
})
