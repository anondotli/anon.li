import { afterEach, describe, expect, it, vi } from "vitest"
import { emailFrom, mailboxAddress } from "@/lib/email-from"

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

describe("mailboxAddress", () => {
    it("returns the bare mailbox address on the sender domain", () => {
        vi.stubEnv("EMAIL_FROM_DOMAIN", "")
        expect(mailboxAddress()).toBe("hi@anon.li")

        vi.stubEnv("EMAIL_FROM_DOMAIN", " mail.example.dev ")
        expect(mailboxAddress("billing")).toBe("billing@mail.example.dev")
    })
})
