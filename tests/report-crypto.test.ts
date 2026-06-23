import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    warn: vi.fn(),
    error: vi.fn(),
}))

vi.mock("@/lib/logger", () => ({
    createLogger: () => ({
        debug: vi.fn(),
        info: vi.fn(),
        warn: mocks.warn,
        error: mocks.error,
    }),
}))

import { encryptReportKey, safeDecryptReportKey } from "@/lib/report-crypto"

const TEST_KEY_HEX = "ffeedd ccbbaa99887766554433221100ffeeddccbbaa99887766554433221100".replace(/\s/g, "")

describe("report key encryption", () => {
    const original = process.env.REPORT_ENCRYPTION_KEY
    beforeAll(() => {
        process.env.REPORT_ENCRYPTION_KEY = TEST_KEY_HEX
    })
    afterAll(() => {
        if (original === undefined) delete process.env.REPORT_ENCRYPTION_KEY
        else process.env.REPORT_ENCRYPTION_KEY = original
    })
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it("round-trips an encrypted key and logs nothing", () => {
        const key = "drop-decryption-key-material"
        const encrypted = encryptReportKey(key)

        expect(encrypted).not.toContain(key)
        expect(safeDecryptReportKey(encrypted)).toBe(key)
        expect(mocks.warn).not.toHaveBeenCalled()
        expect(mocks.error).not.toHaveBeenCalled()
    })

    it("uses a fresh IV so the same key encrypts to different ciphertext", () => {
        const a = encryptReportKey("k")
        const b = encryptReportKey("k")
        expect(a).not.toBe(b)
        expect(safeDecryptReportKey(a)).toBe("k")
        expect(safeDecryptReportKey(b)).toBe("k")
    })

    it("passes a legacy plaintext value through and logs a warning (not an error)", () => {
        // Short value that doesn't decode to our IV+authTag overhead: treated as a
        // pre-encryption plaintext key and returned unchanged.
        const legacy = "legacy"
        expect(safeDecryptReportKey(legacy)).toBe(legacy)
        expect(mocks.warn).toHaveBeenCalledTimes(1)
        expect(mocks.error).not.toHaveBeenCalled()
    })

    it("logs an ERROR when a ciphertext-format value fails to decrypt (key breakage)", () => {
        // Valid ciphertext with one byte flipped: still in our format (decodes to
        // >= IV+authTag bytes) but un-authenticatable — the signal that the key is
        // rotated/misconfigured rather than a benign legacy plaintext.
        const encrypted = encryptReportKey("secret")
        const raw = Buffer.from(encrypted, "base64")
        raw.writeUInt8(raw.readUInt8(13) ^ 0xff, 13)
        const corrupted = raw.toString("base64")

        expect(safeDecryptReportKey(corrupted)).toBe(corrupted)
        expect(mocks.error).toHaveBeenCalledTimes(1)
        expect(mocks.warn).not.toHaveBeenCalled()
    })
})
