/**
 * @vitest-environment jsdom
 *
 * Proves the full Track E member-grant crypto path end-to-end with the REAL
 * primitives — the user identity keypair (private key wrapped to the user's
 * vault key) + the P-256 sealed box — so the design in ORG-E2EE-DESIGN.md is
 * demonstrably sound before any schema / endpoint / UI is built. No DB, no mocks.
 */
import { describe, expect, it } from "vitest"

import { openWithPrivateKey, sealToPublicKey } from "@/lib/crypto/asymmetric"
import { generateVaultKey } from "@/lib/vault/crypto"
import { provisionIdentityKeypair, recoverIdentityPrivateKey } from "@/lib/vault/identity-keypair"

const ORG_VAULT_KEY_INFO = "anon.li/org-vault-key/v1"

describe("vault identity keypair (Track E member-grant path)", () => {
    it("end-to-end: admin grants the org vault key to a member offline; member unlocks and recovers it", async () => {
        // 1. Member sets up their vault → vault key in hand.
        const memberVaultKey = await generateVaultKey()

        // 2. On vault setup, provision the identity keypair (what gets stored on UserSecurity).
        const stored = await provisionIdentityKeypair(memberVaultKey)
        expect(stored.identityPublicKey).toMatch(/^[A-Za-z0-9_-]+$/)
        expect(stored.wrappedIdentityPrivateKey).toMatch(/^[A-Za-z0-9_-]+$/)

        // 3. An admin — with no access to the member's vault — seals the org vault key
        //    to the member's PUBLIC key (the offline grant).
        const orgVaultKey = crypto.getRandomValues(new Uint8Array(32))
        const grant = await sealToPublicKey(stored.identityPublicKey, orgVaultKey, ORG_VAULT_KEY_INFO)

        // 4. Later the member unlocks their vault, recovers the identity private key,
        //    and opens the grant → recovers the SAME org vault key.
        const privateKey = await recoverIdentityPrivateKey(stored.wrappedIdentityPrivateKey, memberVaultKey)
        const recovered = new Uint8Array(await openWithPrivateKey(privateKey, grant, ORG_VAULT_KEY_INFO))
        expect([...recovered]).toEqual([...orgVaultKey])
    })

    it("binds the identity private key to the member's vault — a different vault key cannot recover it", async () => {
        const vaultKey = await generateVaultKey()
        const stored = await provisionIdentityKeypair(vaultKey)

        const attackerVaultKey = await generateVaultKey()
        await expect(
            recoverIdentityPrivateKey(stored.wrappedIdentityPrivateKey, attackerVaultKey),
        ).rejects.toThrow()
    })

    it("denies a different member — a grant sealed to member A is unreadable by member B", async () => {
        const aliceVaultKey = await generateVaultKey()
        const bobVaultKey = await generateVaultKey()
        const alice = await provisionIdentityKeypair(aliceVaultKey)
        const bob = await provisionIdentityKeypair(bobVaultKey)

        const orgVaultKey = crypto.getRandomValues(new Uint8Array(32))
        const grantForAlice = await sealToPublicKey(alice.identityPublicKey, orgVaultKey, ORG_VAULT_KEY_INFO)

        const bobPriv = await recoverIdentityPrivateKey(bob.wrappedIdentityPrivateKey, bobVaultKey)
        await expect(openWithPrivateKey(bobPriv, grantForAlice, ORG_VAULT_KEY_INFO)).rejects.toThrow()
    })

    it("each provisioning yields a distinct keypair", async () => {
        const vaultKey = await generateVaultKey()
        const a = await provisionIdentityKeypair(vaultKey)
        const b = await provisionIdentityKeypair(vaultKey)
        expect(a.identityPublicKey).not.toEqual(b.identityPublicKey)
        expect(a.wrappedIdentityPrivateKey).not.toEqual(b.wrappedIdentityPrivateKey)
    })
})
