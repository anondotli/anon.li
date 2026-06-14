/**
 * @vitest-environment jsdom
 *
 * Regression for the rotation re-wrap bug (would have caught the AES-KW vs
 * AES-GCM-payload mix-up that corrupted every org FORM key on rotation):
 *
 * Org-owned owner keys come in TWO wire formats:
 *   - Drop owner keys = a raw AES content key, wrapped with AES-KW
 *     (wrapVaultManagedKey).
 *   - Form owner keys = a PKCS#8 private key, wrapped as an AES-GCM payload
 *     (wrapVaultPayload, with the form owner-key AAD).
 *
 * A rotation must re-wrap each with its OWN scheme. This proves both round-trip
 * old→new org key, and that using the AES-KW path on a form-key payload fails
 * (the original bug), so the two paths can never be conflated again.
 */
import { describe, expect, it } from "vitest"

import {
    unwrapVaultManagedKey,
    unwrapVaultPayload,
    wrapVaultManagedKey,
    wrapVaultPayload,
} from "@/lib/vault/crypto"
import { generateOrgVaultKey } from "@/lib/vault/org-vault-key"

async function exportRaw(key: CryptoKey): Promise<ArrayBuffer> {
    return crypto.subtle.exportKey("raw", key)
}

describe("org vault key rotation — owner-key re-wrap", () => {
    it("re-wraps a Drop (AES-KW) owner key old→new and it still decrypts", async () => {
        const oldOrgKey = await generateOrgVaultKey()
        const newOrgKey = await generateOrgVaultKey()

        // A drop content key (raw AES-256) wrapped to the OLD org key.
        const contentKey = await crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"])
        const rawContentKey = await exportRaw(contentKey)
        const wrappedOld = await wrapVaultManagedKey(rawContentKey, oldOrgKey)

        // Rotation: unwrap with old, re-wrap with new (the drop branch).
        const raw = await exportRaw(await unwrapVaultManagedKey(wrappedOld, oldOrgKey))
        const wrappedNew = await wrapVaultManagedKey(raw, newOrgKey)

        // A member holding the NEW org key recovers the identical content key.
        const recovered = await unwrapVaultManagedKey(wrappedNew, newOrgKey)
        expect(new Uint8Array(await exportRaw(recovered))).toEqual(new Uint8Array(rawContentKey))
    })

    it("re-wraps a Form (AES-GCM payload) owner key old→new and it still decrypts", async () => {
        const oldOrgKey = await generateOrgVaultKey()
        const newOrgKey = await generateOrgVaultKey()

        // A form private key is a PKCS#8 blob — arbitrary-length payload, NOT an
        // AES key. Use a realistic ECDH P-256 private key export.
        const formKeypair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])
        const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", formKeypair.privateKey))
        const wrappedOld = await wrapVaultPayload(pkcs8, oldOrgKey)

        // Rotation: unwrap with old, re-wrap with new (the FORM branch — payload).
        const bytes = await unwrapVaultPayload(wrappedOld, oldOrgKey)
        const wrappedNew = await wrapVaultPayload(new Uint8Array(bytes), newOrgKey)

        // A member holding the NEW org key recovers the identical PKCS#8 bytes.
        const recovered = new Uint8Array(await unwrapVaultPayload(wrappedNew, newOrgKey))
        expect(recovered).toEqual(pkcs8)
    })

    it("the AES-KW path CANNOT unwrap a form-key payload (the original bug)", async () => {
        const orgKey = await generateOrgVaultKey()
        const formKeypair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])
        const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", formKeypair.privateKey))
        const formBlob = await wrapVaultPayload(pkcs8, orgKey)

        // Using wrapVaultManagedKey's AES-KW unwrap on a wrapVaultPayload blob
        // throws — exactly why rotation must use the payload path for form keys.
        await expect(unwrapVaultManagedKey(formBlob, orgKey)).rejects.toThrow()
    })

    it("a pre-rotation org key cannot open a post-rotation form owner key (revocation)", async () => {
        const oldOrgKey = await generateOrgVaultKey()
        const newOrgKey = await generateOrgVaultKey()
        const formKeypair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, true, ["deriveBits"])
        const pkcs8 = new Uint8Array(await crypto.subtle.exportKey("pkcs8", formKeypair.privateKey))

        // Re-wrapped to the new key (what rotation persists).
        const wrappedNew = await wrapVaultPayload(pkcs8, newOrgKey)

        // The old key (a removed member's stale key) can't open it.
        await expect(unwrapVaultPayload(wrappedNew, oldOrgKey)).rejects.toThrow()
    })
})
