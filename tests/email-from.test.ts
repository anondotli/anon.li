import { afterEach, describe, expect, it, vi } from "vitest"
import { emailFrom } from "@/lib/email-from"

afterEach(() => {
    vi.unstubAllEnvs()
})

describe("emailFrom", () => {
    it("defaults to the anon.li domain", () => {
        vi.stubEnv("EMAIL_FROM_DOMAIN", "")
        expect(emailFrom()).toBe("anon.li <hi@anon.li>")
        expect(emailFrom("billing")).toBe("anon.li <billing@anon.li>")
    })

    it("uses a configured sender domain", () => {
        vi.stubEnv("EMAIL_FROM_DOMAIN", " mail.example.dev ")
        expect(emailFrom()).toBe("anon.li <hi@mail.example.dev>")
    })
})
