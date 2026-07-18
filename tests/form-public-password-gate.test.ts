/** @vitest-environment node */
import crypto from "node:crypto"
import { beforeEach, describe, expect, it, vi } from "vitest"

const { formFindUnique, getFormOwnerEntitlements } = vi.hoisted(() => ({
    formFindUnique: vi.fn(),
    getFormOwnerEntitlements: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: { form: { findUnique: formFindUnique } },
}))
vi.mock("@/lib/services/form-entitlements", () => ({ getFormOwnerEntitlements }))

import { FormService } from "@/lib/services/form"

const schema = {
    version: 1 as const,
    displayMode: "classic" as const,
    fields: [{ id: "secret", type: "short_text" as const, label: "Secret question", required: true }],
    submitButtonText: "Send",
}

function formRow(customKey: boolean, proof = "password-witness") {
    return {
        id: "form-1",
        userId: "owner-1",
        organizationId: null,
        user: { banned: false, banFileUpload: false },
        organization: null,
        title: "Protected form",
        description: null,
        schemaJson: JSON.stringify(schema),
        publicKey: "public-key",
        customKey,
        customKeyVerifier: customKey
            ? crypto.createHash("sha256").update(proof).digest("base64url")
            : null,
        salt: customKey ? "salt" : null,
        customKeyData: customKey ? "wrapped" : null,
        customKeyIv: customKey ? "iv" : null,
        active: true,
        disabledByUser: false,
        takenDown: false,
        deletedAt: null,
        hideBranding: false,
        closesAt: null,
        allowFileUploads: false,
        maxFileSizeOverride: null,
    }
}

describe("FormService.getPublicForm password gate", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        getFormOwnerEntitlements.mockResolvedValue({
            limits: { removeBranding: true, customKey: true },
            tiers: { form: "pro", drop: "pro" },
            subscribed: true,
        })
    })

    it("withholds the question schema until a valid witness is supplied", async () => {
        formFindUnique.mockResolvedValue(formRow(true))

        const locked = await FormService.getPublicForm("form-1")
        expect(locked.schema).toBeNull()
        expect(locked.fieldCount).toBe(1)

        const unlocked = await FormService.getPublicForm("form-1", {
            customKeyProof: "password-witness",
        })
        expect(unlocked.schema).toEqual(schema)
    })

    it("rejects an invalid witness without returning protected questions", async () => {
        formFindUnique.mockResolvedValue(formRow(true))
        await expect(FormService.getPublicForm("form-1", { customKeyProof: "wrong" }))
            .rejects.toMatchObject({ name: "ForbiddenError" })
    })

    it("serves an unprotected schema normally", async () => {
        formFindUnique.mockResolvedValue(formRow(false))
        await expect(FormService.getPublicForm("form-1")).resolves.toMatchObject({ schema })
    })

    it("closes a form when its target owner is banned", async () => {
        formFindUnique.mockResolvedValue({
            ...formRow(false),
            user: { banned: true, banFileUpload: true },
        })

        await expect(FormService.getPublicForm("form-1")).resolves.toMatchObject({
            active: false,
            allowFileUploads: false,
        })
    })
})
