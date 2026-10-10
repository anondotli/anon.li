import { describe, expect, it } from "vitest"
import {
    DEFAULT_TEXT_MAX_LENGTH,
    validateAnswersAgainstSchema,
    type FormField,
    type FormSchemaDoc,
} from "@/lib/form-schema"
import { validateFormFieldAnswer } from "@/lib/form-answer-validation"
import { convertField } from "@/lib/form-field-utils"
import { parseDecryptedSubmissionPayload } from "@/components/form/dashboard/responses/shared"
import { buildFormInput } from "@/components/form/dashboard/form-input"

function schemaWith(fields: FormField[]): FormSchemaDoc {
    return {
        version: 1,
        title: "Limits",
        displayMode: "classic",
        submitButtonText: "Send",
        notifyOnSubmission: true,
        fields,
    }
}

const longText: FormField = { id: "story", type: "long_text", label: "Story", required: false }
const email: FormField = { id: "email", type: "email", label: "Email", required: false }
const address: FormField = { id: "addr", type: "address", label: "Address", required: false }

describe("default text answer cap", () => {
    it("rejects text over the default cap when the builder set no maxLength", () => {
        const tooLong = "a".repeat(DEFAULT_TEXT_MAX_LENGTH + 1)
        expect(() => validateAnswersAgainstSchema(schemaWith([longText]), { story: tooLong }))
            .toThrow(`exceeds ${DEFAULT_TEXT_MAX_LENGTH} characters`)
        expect(validateFormFieldAnswer(longText, tooLong)).toBe(`Keep this under ${DEFAULT_TEXT_MAX_LENGTH} characters`)
        expect(validateFormFieldAnswer(longText, "a".repeat(DEFAULT_TEXT_MAX_LENGTH))).toBeNull()
    })

    it("applies the default cap to email answers too", () => {
        const tooLong = `${"a".repeat(DEFAULT_TEXT_MAX_LENGTH)}@example.com`
        expect(() => validateAnswersAgainstSchema(schemaWith([email]), { email: tooLong }))
            .toThrow("exceeds")
        expect(validateFormFieldAnswer(email, tooLong)).toMatch(/Keep this under/)
    })

    it("keeps an explicit maxLength authoritative", () => {
        const capped: FormField = { ...longText, type: "long_text", maxLength: 10 }
        expect(validateFormFieldAnswer(capped, "a".repeat(11))).toBe("Keep this under 10 characters")
    })
})

describe("address part limits", () => {
    it("reports over-long parts as readable text instead of a raw Zod issue list", () => {
        let message = ""
        try {
            validateAnswersAgainstSchema(schemaWith([address]), {
                addr: { line1: "x".repeat(201), city: "Ljubljana", country: "Slovenia" },
            })
        } catch (err) {
            message = (err as Error).message
        }
        expect(message).toBe('Field "Address": Address line 1 must be at most 200 characters')
        expect(message).not.toContain("[")
    })

    it("flags over-long parts at the question level before submit", () => {
        expect(validateFormFieldAnswer(address, { line1: "1 Main", city: "c".repeat(121), country: "SI" }))
            .toBe("City must be at most 120 characters")
    })
})

describe("dashboard submission parser", () => {
    it("still decrypts a submission whose answer exceeds the old 50,000 cap", () => {
        const answer = "b".repeat(80_000)
        const parsed = parseDecryptedSubmissionPayload(JSON.stringify({
            version: 1,
            answers: { story: answer, name: "Ada" },
            attachments: null,
        }))
        expect(parsed.answers).toEqual({ story: answer, name: "Ada" })
    })
})

describe("builder field helpers", () => {
    it("keeps a question's visibility rule when its type changes", () => {
        const field: FormField = {
            id: "detail",
            type: "short_text",
            label: "Detail",
            required: false,
            visibleWhen: { fieldId: "first", op: "isNotEmpty" },
        }
        const converted = convertField(field, "long_text", [field])
        expect(converted.visibleWhen).toEqual({ fieldId: "first", op: "isNotEmpty" })
    })
})

describe("builder save validation", () => {
    const base = {
        title: "Survey",
        description: "",
        hideBranding: false,
        maxSubmissions: "",
        closesAt: "",
    }

    it("trims ranking options and explains a too-short ranking", () => {
        const result = buildFormInput({
            ...base,
            schema: schemaWith([
                { id: "rank", type: "ranking", label: "Rank these", required: false, options: ["  A  ", "   "] },
            ]),
        })
        expect(result).toEqual({ error: '"Rank these" needs at least 2 choices' })
    })

    it("stores trimmed ranking options", () => {
        const result = buildFormInput({
            ...base,
            schema: schemaWith([
                { id: "rank", type: "ranking", label: "Rank", required: false, options: [" A ", "B ", ""] },
            ]),
        })
        expect("data" in result && result.data.schema.fields[0]).toMatchObject({ options: ["A", "B"] })
    })

    it("names duplicate choices instead of claiming none exist", () => {
        const result = buildFormInput({
            ...base,
            schema: schemaWith([
                { id: "pick", type: "single_select", label: "Pick", required: false, options: ["Same", "Same "] },
            ]),
        })
        expect(result).toEqual({ error: '"Pick" has duplicate choices' })
    })

    it("explains an over-long choice", () => {
        const result = buildFormInput({
            ...base,
            schema: schemaWith([
                { id: "pick", type: "dropdown", label: "Pick", required: false, options: ["ok", "x".repeat(201)] },
            ]),
        })
        expect(result).toEqual({ error: 'Choice 2 of "Pick" is too long (max 200 characters)' })
    })
})
