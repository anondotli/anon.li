/**
 * Drop / Form public id format contract.
 * @vitest-environment node
 *
 * New ids are 8 lowercase-base36 chars. Ids minted before the shortening are
 * longer (16 for drops, 12 for forms) and MUST keep resolving — the columns are
 * TEXT with no length constraint, so the only thing that could break a legacy
 * link is an over-strict validator. These tests pin that down.
 */
import { describe, expect, it } from "vitest"

import { FormId, SubmissionId } from "@/lib/validations/form"
import { addFileActionSchema, addRecipientsSchema } from "@/lib/validations/drop"

const NEW_FORM_ID = "a1b2c3d4" // 8 chars
const LEGACY_FORM_ID = "abc123def456" // 12 chars
const NEW_DROP_ID = "0z9y8x7w" // 8 chars
const LEGACY_DROP_ID = "abcdefghijklmnop" // 16 chars

describe("FormId accepts exactly the two formats that were minted", () => {
    it.each([
        ["8 chars (current generator output)", NEW_FORM_ID],
        ["12 chars (legacy format)", LEGACY_FORM_ID],
    ])("accepts %s", (_label, value) => {
        expect(FormId.safeParse(value).success).toBe(true)
    })

    // Lengths between the two formats were never generated, so they are invalid
    // rather than tolerated — keeps the accepted set as small as the data allows.
    it.each([
        ["7 chars (too short)", "a1b2c3d"],
        ["9 chars (never minted)", "a1b2c3d4e"],
        ["10 chars (never minted)", "a1b2c3d4e5"],
        ["11 chars (never minted)", "a1b2c3d4e5f"],
        ["13 chars (too long)", "abc123def4567"],
        ["uppercase", "A1B2C3D4"],
        ["hyphen", "a1b2-c3d"],
        ["underscore", "a1b2_c3d"],
        ["empty", ""],
    ])("rejects %s", (_label, value) => {
        expect(FormId.safeParse(value).success).toBe(false)
    })
})

describe("SubmissionId is unchanged by the id shortening", () => {
    it("still requires exactly 14 chars", () => {
        expect(SubmissionId.safeParse("abcdefgh123456").success).toBe(true)
        expect(SubmissionId.safeParse(NEW_FORM_ID).success).toBe(false)
    })
})

describe("Drop id validators are length-agnostic", () => {
    const fileFields = {
        size: 1024,
        encryptedName: "name",
        iv: "0123456789abcdef", // 16 base64url chars — the AES-GCM IV, not an id
        mimeType: "application/octet-stream",
        chunkCount: 1,
        chunkSize: 1024,
    }

    const dropIds: Array<[string, string]> = [
        ["new 8-char drop id", NEW_DROP_ID],
        ["legacy 16-char drop id", LEGACY_DROP_ID],
    ]

    it.each(dropIds)("addFileActionSchema accepts a %s", (_label, dropId) => {
        expect(addFileActionSchema.safeParse({ dropId, ...fileFields }).success).toBe(true)
    })

    it.each(dropIds)("addRecipientsSchema accepts a %s", (_label, dropId) => {
        const parsed = addRecipientsSchema.safeParse({
            dropId,
            recipients: [{ email: "a@example.com" }],
        })
        expect(parsed.success).toBe(true)
    })
})
