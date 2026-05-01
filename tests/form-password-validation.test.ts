/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"
import { createFormSchema, updateFormSchema } from "@/lib/validations/form"
import { cryptoService } from "@/lib/crypto.client"

const baseInput = {
    title: "Protected form",
    schema: {
        version: 1,
        displayMode: "classic",
        submitButtonText: "Send",
        thankYouMessage: "Received.",
        fields: [
            { id: "name", type: "short_text", label: "Name", required: false },
        ],
    },
    publicKey: "A".repeat(43) + "_" + "B".repeat(43), // 87 chars
    wrappedPrivateKey: "x".repeat(64),
    vaultGeneration: 0,
}

async function verifierFor(witness: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(witness))
    return cryptoService.arrayBufferToBase64Url(digest)
}

describe("form password validation", () => {
    it("accepts the salt + iv shapes produced by cryptoService", async () => {
        // Same primitives the dialog uses to construct password material.
        const witness = cryptoService.generateSalt()
        const { encryptedKey, iv, salt } = await cryptoService.encryptKeyWithPassword(
            witness,
            "correct-horse-battery-staple",
        )
        const customKeyVerifier = await verifierFor(witness)

        // Sanity: confirm sizes are stable so future regressions are obvious.
        expect(salt).toMatch(/^[A-Za-z0-9_-]{43}$/)
        expect(iv).toMatch(/^[A-Za-z0-9_-]{16}$/)
        expect(encryptedKey.length).toBeGreaterThanOrEqual(70)
        expect(customKeyVerifier).toMatch(/^[A-Za-z0-9_-]{43}$/)

        const created = createFormSchema.safeParse({
            ...baseInput,
            customKey: true,
            salt,
            customKeyData: encryptedKey,
            customKeyIv: iv,
            customKeyVerifier,
        })
        expect(created.success).toBe(true)

        const updated = updateFormSchema.safeParse({
            customKey: true,
            salt,
            customKeyData: encryptedKey,
            customKeyIv: iv,
            customKeyVerifier,
        })
        expect(updated.success).toBe(true)
    })

    it("rejects malformed password material", () => {
        const result = createFormSchema.safeParse({
            ...baseInput,
            customKey: true,
            salt: "too-short",
            customKeyData: "x".repeat(80),
            customKeyIv: "x".repeat(16),
            customKeyVerifier: "bad",
        })
        expect(result.success).toBe(false)
    })

    it("allows clearing password material on update", () => {
        const result = updateFormSchema.safeParse({
            customKey: false,
            salt: null,
            customKeyData: null,
            customKeyIv: null,
            customKeyVerifier: null,
        })
        expect(result.success).toBe(true)
    })

    it("requires a verifier when password protection is enabled", () => {
        const result = createFormSchema.safeParse({
            ...baseInput,
            customKey: true,
            salt: "S".repeat(43),
            customKeyData: "x".repeat(80),
            customKeyIv: "I".repeat(16),
        })
        expect(result.success).toBe(false)
    })
})
