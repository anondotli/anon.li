import { describe, expect, it } from "vitest"

import { normalizeDropKeyInput } from "@/lib/drop-link"

const validKey = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJ1234567"

describe("normalizeDropKeyInput", () => {
    it("accepts a raw drop key", () => {
        expect(normalizeDropKeyInput(validKey)).toBe(validKey)
    })

    it("extracts a key from a full share URL", () => {
        expect(normalizeDropKeyInput(`https://anon.li/d/drop123#${validKey}`)).toBe(validKey)
    })

    it("extracts a key from pasted text containing a fragment", () => {
        expect(normalizeDropKeyInput(`anon.li/d/drop123#${validKey}`)).toBe(validKey)
    })

    it("rejects arbitrary passphrases", () => {
        expect(normalizeDropKeyInput("correct horse battery staple")).toBeNull()
    })
})
