/**
 * @vitest-environment jsdom
 */
import { describe, expect, it } from "vitest"

import { decryptVaultText, encryptVaultText, generateVaultKey } from "@/lib/vault/crypto"

describe("alias metadata vault crypto", () => {
    it("round-trips encrypted alias metadata", async () => {
        const vaultKey = await generateVaultKey()
        const encrypted = await encryptVaultText("Shopping", vaultKey, {
            aliasId: "alias-1",
            field: "label",
        })

        expect(encrypted).not.toContain("Shopping")
        await expect(decryptVaultText(encrypted, vaultKey, {
            aliasId: "alias-1",
            field: "label",
        })).resolves.toBe("Shopping")
    })

    it("rejects ciphertext under the wrong alias or field context", async () => {
        const vaultKey = await generateVaultKey()
        const encrypted = await encryptVaultText("Private note", vaultKey, {
            aliasId: "alias-1",
            field: "note",
        })

        await expect(decryptVaultText(encrypted, vaultKey, {
            aliasId: "alias-2",
            field: "note",
        })).rejects.toBeTruthy()

        await expect(decryptVaultText(encrypted, vaultKey, {
            aliasId: "alias-1",
            field: "label",
        })).rejects.toBeTruthy()
    })
})
