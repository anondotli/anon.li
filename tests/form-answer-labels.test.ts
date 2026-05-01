import { describe, expect, it } from "vitest"
import { formatFormAnswerLabel } from "@/lib/form-answer-labels"

describe("formatFormAnswerLabel", () => {
    it("uses the current field label when the field still exists", () => {
        expect(formatFormAnswerLabel("email", { email: "Email address" })).toBe("Email address")
    })

    it("falls back to the field ID for removed or renamed fields", () => {
        expect(formatFormAnswerLabel("legacy_field", {})).toBe("Field legacy_field")
    })
})
