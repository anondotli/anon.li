/**
 * @vitest-environment jsdom
 *
 * End-to-end proof of the shared-team E2EE CENTERPIECE: two different org members
 * decrypt the SAME org-owned Drop, using only the real primitives — identity
 * keypairs (wrapped to each member's vault) + the org vault key (sealed to each
 * member's identity public key) + the EXISTING owner-key wrapping. Plus
 * cross-member denial and rotation = revocation for new content. No DB, no mocks.
 */
import { describe, expect, it } from "vitest"

import {
    arrayBufferToBase64Url,
    exportKeyBase64Url,
    generateVaultKey,
    unwrapVaultManagedKey,
    wrapVaultManagedKey,
} from "@/lib/vault/crypto"
import { provisionIdentityKeypair, recoverIdentityPrivateKey } from "@/lib/vault/identity-keypair"
import {
    generateOrgVaultKey,
    unwrapOrgVaultKeyForMember,
    wrapOrgVaultKeyForMember,
} from "@/lib/vault/org-vault-key"

// A "member" = their personal vault key + a provisioned identity keypair.
async function makeMember() {
    const vaultKey = await generateVaultKey()
    const identity = await provisionIdentityKeypair(vaultKey)
    return { vaultKey, identity }
}
type Member = Awaited<ReturnType<typeof makeMember>>

// Recover a member's identity private key the way the app does after unlock.
const memberPrivateKey = (m: Member) =>
    recoverIdentityPrivateKey(m.identity.wrappedIdentityPrivateKey, m.vaultKey)

describe("org vault key — shared-team decryption", () => {
    it("two different members decrypt the SAME org-owned Drop", async () => {
        const alice = await makeMember() // org creator/admin
        const bob = await makeMember() // invited member

        // Creator seeds the org vault key and grants it to both members
        // (sealed to each identity public key — the offline grant).
        const orgVaultKey = await generateOrgVaultKey()
        const aliceGrant = await wrapOrgVaultKeyForMember(orgVaultKey, alice.identity.identityPublicKey)
        const bobGrant = await wrapOrgVaultKeyForMember(orgVaultKey, bob.identity.identityPublicKey)

        // An org-owned Drop: its content key is wrapped to the ORG vault key
        // (this is what DropOwnerKey.wrappedKey would hold when organizationId is set).
        const dropContentKey = crypto.getRandomValues(new Uint8Array(32))
        const dropOwnerKeyWrapped = await wrapVaultManagedKey(dropContentKey, orgVaultKey)
        const expected = arrayBufferToBase64Url(dropContentKey)

        // Bob: identity priv → org vault key → drop content key.
        const bobOrgKey = await unwrapOrgVaultKeyForMember(bobGrant, await memberPrivateKey(bob))
        const bobContentKey = await unwrapVaultManagedKey(dropOwnerKeyWrapped, bobOrgKey)

        // Alice: the same, via her own grant.
        const aliceOrgKey = await unwrapOrgVaultKeyForMember(aliceGrant, await memberPrivateKey(alice))
        const aliceContentKey = await unwrapVaultManagedKey(dropOwnerKeyWrapped, aliceOrgKey)

        // Both independently recovered the identical content key.
        expect(await exportKeyBase64Url(bobContentKey)).toBe(expected)
        expect(await exportKeyBase64Url(aliceContentKey)).toBe(expected)
    })

    it("denies a non-granted member — a different identity cannot open someone's grant", async () => {
        const alice = await makeMember()
        const mallory = await makeMember() // never granted

        const orgVaultKey = await generateOrgVaultKey()
        const aliceGrant = await wrapOrgVaultKeyForMember(orgVaultKey, alice.identity.identityPublicKey)

        await expect(
            unwrapOrgVaultKeyForMember(aliceGrant, await memberPrivateKey(mallory)),
        ).rejects.toThrow()
    })

    it("rotation revokes access to NEW content — a removed member's old org key can't open rotated resources", async () => {
        const alice = await makeMember()
        const bob = await makeMember()

        const orgKeyV1 = await generateOrgVaultKey()
        const bobGrantV1 = await wrapOrgVaultKeyForMember(orgKeyV1, bob.identity.identityPublicKey)

        // Bob is removed → rotate: new org vault key, re-granted only to Alice.
        const orgKeyV2 = await generateOrgVaultKey()
        const aliceGrantV2 = await wrapOrgVaultKeyForMember(orgKeyV2, alice.identity.identityPublicKey)

        // A new org Drop wrapped to the rotated key.
        const newContentKey = crypto.getRandomValues(new Uint8Array(32))
        const newOwnerKeyWrapped = await wrapVaultManagedKey(newContentKey, orgKeyV2)

        // Alice (re-granted) opens it.
        const aliceOrgKeyV2 = await unwrapOrgVaultKeyForMember(aliceGrantV2, await memberPrivateKey(alice))
        expect(await exportKeyBase64Url(await unwrapVaultManagedKey(newOwnerKeyWrapped, aliceOrgKeyV2)))
            .toBe(arrayBufferToBase64Url(newContentKey))

        // Bob, holding only the OLD org key, cannot decrypt the rotated resource.
        const bobOrgKeyV1 = await unwrapOrgVaultKeyForMember(bobGrantV1, await memberPrivateKey(bob))
        await expect(unwrapVaultManagedKey(newOwnerKeyWrapped, bobOrgKeyV1)).rejects.toThrow()
    })
})
