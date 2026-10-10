/**
 * @vitest-environment node
 *
 * The client-side copies of API error codes (kept out of the server-only
 * lib/api-response.ts bundle) must match the server's ErrorCodes exactly.
 */
import { describe, expect, it } from "vitest"
import { ErrorCodes } from "@/lib/api-response"
import {
    ORG_KEY_GENERATION_MISMATCH_CODE,
    ORG_KEY_LAST_HOLDER_CODE,
    ROTATION_DATA_CHANGED_CODE,
} from "@/lib/vault/error-codes"
import { SESSION_NOT_FRESH_ERROR_CODE } from "@/lib/vault/session-freshness"
import { CIPHERTEXT_HASH_PATTERN, hashCiphertext, hashNullableCiphertext } from "@/lib/vault/ciphertext-hash"

describe("vault client error codes", () => {
    it("mirror the server ErrorCodes", () => {
        expect(ROTATION_DATA_CHANGED_CODE).toBe(ErrorCodes.ROTATION_DATA_CHANGED)
        expect(ORG_KEY_GENERATION_MISMATCH_CODE).toBe(ErrorCodes.ORG_KEY_GENERATION_MISMATCH)
        expect(ORG_KEY_LAST_HOLDER_CODE).toBe(ErrorCodes.ORG_KEY_LAST_HOLDER)
        expect(SESSION_NOT_FRESH_ERROR_CODE).toBe(ErrorCodes.SESSION_NOT_FRESH)
    })
})

describe("hashCiphertext", () => {
    it("is a stable 43-char base64url SHA-256", async () => {
        const hash = await hashCiphertext("abc")
        expect(hash).toBe("ungWv48Bz-pBQUDeXa4iI7ADYaOWF3qctBD_YfIAFa0")
        expect(hash).toMatch(CIPHERTEXT_HASH_PATTERN)
        expect(await hashNullableCiphertext(null)).toBeNull()
    })
})
