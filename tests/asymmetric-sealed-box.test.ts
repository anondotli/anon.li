/**
 * @vitest-environment jsdom
 *
 * Locks the reusable P-256 sealed-box primitive (lib/crypto/asymmetric.ts) that
 * both Form submissions and the org shared-E2EE grant path build on
 * (see lib/vault/ORG-E2EE-DESIGN.md §10.1). Covers the security-critical
 * properties: only the private-key holder can open, HKDF `info` domain
 * separation, AES-GCM tamper detection, and that the Form wrappers remain
 * byte/wire-faithful over the generalized primitive.
 */
import { describe, expect, it } from "vitest"

import {
    decryptFromSubmission,
    encryptForForm,
    generateKeypair,
    openWithPrivateKey,
    sealToPublicKey,
    type SealedBox,
} from "@/lib/crypto/asymmetric"

const ORG_INFO = "anon.li/org-vault-key/v1"
const FORM_INFO = "anon.li/form-submission/v1"

function flipFirstChar(b64url: string): string {
    const first = b64url[0]
    return (first === "A" ? "B" : "A") + b64url.slice(1)
}

describe("asymmetric sealed box (P-256)", () => {
    it("round-trips arbitrary bytes to the holder of the private key", async () => {
        const kp = await generateKeypair()
        const secret = crypto.getRandomValues(new Uint8Array(32)) // e.g. a raw org vault key
        const box = await sealToPublicKey(kp.publicKey, secret, ORG_INFO)
        const opened = new Uint8Array(await openWithPrivateKey(kp.privateKey, box, ORG_INFO))
        expect([...opened]).toEqual([...secret])
    })

    it("is non-deterministic — fresh ephemeral key + iv per seal", async () => {
        const kp = await generateKeypair()
        const msg = new TextEncoder().encode("hello")
        const a = await sealToPublicKey(kp.publicKey, msg, ORG_INFO)
        const b = await sealToPublicKey(kp.publicKey, msg, ORG_INFO)
        expect(a.ephemeralPublicKey).not.toEqual(b.ephemeralPublicKey)
        expect(a.iv).not.toEqual(b.iv)
        expect(a.ciphertext).not.toEqual(b.ciphertext)
    })

    it("denies a different recipient — wrong private key cannot open", async () => {
        const alice = await generateKeypair()
        const mallory = await generateKeypair()
        const box = await sealToPublicKey(alice.publicKey, new TextEncoder().encode("for alice"), ORG_INFO)
        await expect(openWithPrivateKey(mallory.privateKey, box, ORG_INFO)).rejects.toThrow()
    })

    it("enforces HKDF domain separation — same key, wrong info fails", async () => {
        const kp = await generateKeypair()
        const box = await sealToPublicKey(kp.publicKey, new TextEncoder().encode("scoped"), ORG_INFO)
        await expect(openWithPrivateKey(kp.privateKey, box, FORM_INFO)).rejects.toThrow()
        // the correct info still opens it
        const ok = new Uint8Array(await openWithPrivateKey(kp.privateKey, box, ORG_INFO))
        expect(new TextDecoder().decode(ok)).toBe("scoped")
    })

    it("detects ciphertext tampering via AES-GCM auth", async () => {
        const kp = await generateKeypair()
        const box = await sealToPublicKey(kp.publicKey, new TextEncoder().encode("integrity"), ORG_INFO)
        const tampered: SealedBox = { ...box, ciphertext: flipFirstChar(box.ciphertext) }
        await expect(openWithPrivateKey(kp.privateKey, tampered, ORG_INFO)).rejects.toThrow()
    })
})

describe("Form wrappers stay wire-compatible over the shared primitive", () => {
    it("encryptForForm → decryptFromSubmission round-trips (incl. multibyte)", async () => {
        const kp = await generateKeypair()
        const sub = await encryptForForm(kp.publicKey, "submission body 🤐")
        // wire field names preserved (stored/transmitted shape unchanged)
        expect(sub).toHaveProperty("ephemeralPubKey")
        expect(sub).toHaveProperty("encryptedPayload")
        expect(await decryptFromSubmission(kp.privateKey, sub)).toBe("submission body 🤐")
    })

    it("a Form submission opens via the generic primitive with FORM info (faithful mapping)", async () => {
        const kp = await generateKeypair()
        const sub = await encryptForForm(kp.publicKey, "x-check")
        const opened = await openWithPrivateKey(
            kp.privateKey,
            { ephemeralPublicKey: sub.ephemeralPubKey, iv: sub.iv, ciphertext: sub.encryptedPayload },
            FORM_INFO,
        )
        expect(new TextDecoder().decode(opened)).toBe("x-check")
    })

    it("Form and org info are separated — a Form box won't open under org info", async () => {
        const kp = await generateKeypair()
        const sub = await encryptForForm(kp.publicKey, "y")
        await expect(
            openWithPrivateKey(
                kp.privateKey,
                { ephemeralPublicKey: sub.ephemeralPubKey, iv: sub.iv, ciphertext: sub.encryptedPayload },
                ORG_INFO,
            ),
        ).rejects.toThrow()
    })
})
