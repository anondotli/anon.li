import { describe, it, expect } from "vitest"
import {
    FormSchemaDoc,
    validateAnswersAgainstSchema,
    isBlankObject,
    parseAddressValue,
    formatAddress,
    serializeSchema,
    defaultAddressParts,
    missingRequiredAddressParts,
    getAddressParts,
    minifyAddressParts,
    type FormField,
    type AddressPartsConfig,
} from "@/lib/form-schema"
import { createField } from "@/lib/form-field-utils"

// Build a full address parts config from the default plus per-part overrides.
function addressParts(overrides: Partial<AddressPartsConfig>): AddressPartsConfig {
    return { ...defaultAddressParts(), ...overrides }
}

// Build a one-field FormSchemaDoc (applying Zod defaults) around a partial field.
function docWith(field: Record<string, unknown>): FormSchemaDoc {
    return FormSchemaDoc.parse({
        version: 1,
        displayMode: "classic",
        fields: [field],
        submitButtonText: "Submit",
    })
}

describe("linear_scale field", () => {
    const base = { id: "scale", label: "How likely?", type: "linear_scale" as const }

    it("parses with defaults (min 1, max 5)", () => {
        const doc = docWith(base)
        const field = doc.fields[0] as Extract<FormField, { type: "linear_scale" }>
        expect(field.min).toBe(1)
        expect(field.max).toBe(5)
    })

    it("accepts an in-range integer answer", () => {
        const doc = docWith({ ...base, min: 0, max: 10 })
        expect(validateAnswersAgainstSchema(doc, { scale: 0 })).toEqual({ scale: 0 })
        expect(validateAnswersAgainstSchema(doc, { scale: 10 })).toEqual({ scale: 10 })
    })

    it("rejects out-of-range and non-integer answers", () => {
        const doc = docWith({ ...base, min: 1, max: 5 })
        expect(() => validateAnswersAgainstSchema(doc, { scale: 6 })).toThrow()
        expect(() => validateAnswersAgainstSchema(doc, { scale: 0 })).toThrow()
        expect(() => validateAnswersAgainstSchema(doc, { scale: 2.5 })).toThrow()
    })

    it("rejects a min/max outside the allowed bounds at parse time", () => {
        expect(() => docWith({ ...base, min: 2, max: 5 })).toThrow()
        expect(() => docWith({ ...base, min: 0, max: 99 })).toThrow()
    })
})

describe("ranking field", () => {
    const base = {
        id: "rank",
        label: "Order these",
        type: "ranking" as const,
        options: ["A", "B", "C"],
    }

    it("accepts a full permutation of the options", () => {
        const doc = docWith(base)
        expect(validateAnswersAgainstSchema(doc, { rank: ["C", "A", "B"] })).toEqual({
            rank: ["C", "A", "B"],
        })
    })

    it("rejects unknown options, duplicates, and incomplete rankings", () => {
        const doc = docWith(base)
        expect(() => validateAnswersAgainstSchema(doc, { rank: ["A", "B", "Z"] })).toThrow()
        expect(() => validateAnswersAgainstSchema(doc, { rank: ["A", "A", "B"] })).toThrow()
        expect(() => validateAnswersAgainstSchema(doc, { rank: ["A", "B"] })).toThrow()
    })

    it("requires at least two options at parse time", () => {
        expect(() => docWith({ ...base, options: ["only"] })).toThrow()
    })
})

describe("address field", () => {
    const base = { id: "addr", label: "Where?", type: "address" as const }

    it("cleans and trims a populated address", () => {
        const doc = docWith(base)
        const out = validateAnswersAgainstSchema(doc, {
            addr: { line1: "  1 Main St ", city: "Lisbon", country: "Portugal", line2: "" },
        })
        expect(out).toEqual({ addr: { line1: "1 Main St", city: "Lisbon", country: "Portugal" } })
    })

    it("drops an all-blank optional address", () => {
        const doc = docWith(base)
        expect(validateAnswersAgainstSchema(doc, { addr: { line1: "", city: "  " } })).toEqual({})
    })

    it("requires street, city, and country when required", () => {
        const doc = docWith({ ...base, required: true })
        // All blank → required error.
        expect(() => validateAnswersAgainstSchema(doc, { addr: { line1: "" } })).toThrow()
        // Partially filled → still rejected.
        expect(() => validateAnswersAgainstSchema(doc, { addr: { line1: "1 Main St" } })).toThrow()
        // Complete → accepted.
        expect(
            validateAnswersAgainstSchema(doc, {
                addr: { line1: "1 Main St", city: "Lisbon", country: "Portugal" },
            }),
        ).toEqual({ addr: { line1: "1 Main St", city: "Lisbon", country: "Portugal" } })
    })

    it("rejects a non-object address answer", () => {
        const doc = docWith(base)
        expect(() => validateAnswersAgainstSchema(doc, { addr: "123 Main St" })).toThrow()
    })

    it("formatAddress joins non-blank parts and parseAddressValue trims", () => {
        const parsed = parseAddressValue({ line1: " 1 Main ", city: "Lisbon", state: "" }, "Where?")
        expect(parsed).toEqual({ line1: "1 Main", city: "Lisbon" })
        expect(formatAddress(parsed)).toBe("1 Main, Lisbon")
    })

    it("strips parts the form does not ask for", () => {
        const doc = docWith({
            ...base,
            parts: addressParts({
                state: { enabled: false, required: false },
                country: { enabled: false, required: false },
            }),
        })
        // A submitter sending disabled parts should have them dropped.
        const out = validateAnswersAgainstSchema(doc, {
            addr: { line1: "1 Main St", city: "Lisbon", state: "Lisboa", country: "Portugal" },
        })
        expect(out).toEqual({ addr: { line1: "1 Main St", city: "Lisbon" } })
    })

    it("enforces custom required parts and ignores optional ones", () => {
        const doc = docWith({
            ...base,
            required: true,
            parts: addressParts({
                line1: { enabled: true, required: false },
                city: { enabled: true, required: false },
                country: { enabled: true, required: false },
                postalCode: { enabled: true, required: true },
            }),
        })
        // postalCode now the only required part; missing it → error.
        expect(() => validateAnswersAgainstSchema(doc, { addr: { line1: "1 Main St" } })).toThrow()
        // Supplying just the required part is enough.
        expect(validateAnswersAgainstSchema(doc, { addr: { postalCode: "1000" } })).toEqual({
            addr: { postalCode: "1000" },
        })
    })

    it("enforces required parts independently of the question-level required flag", () => {
        // Optional question, default parts (line1/city/country required).
        const doc = docWith(base)
        // Blank overall → optional question lets it pass.
        expect(validateAnswersAgainstSchema(doc, { addr: { line1: "", city: "" } })).toEqual({})
        // Once started, the required parts must be filled → rejected.
        expect(() => validateAnswersAgainstSchema(doc, { addr: { line1: "1 Main St" } })).toThrow()
    })

    it("never enforces a disabled part even if marked required", () => {
        const doc = docWith({
            ...base,
            required: true,
            parts: addressParts({
                country: { enabled: false, required: true },
            }),
        })
        // line1 + city are the remaining required defaults; country is off.
        expect(
            validateAnswersAgainstSchema(doc, { addr: { line1: "1 Main St", city: "Lisbon" } }),
        ).toEqual({ addr: { line1: "1 Main St", city: "Lisbon" } })
    })

    it("rejects an address question with no enabled parts at parse time", () => {
        const allOff = Object.fromEntries(
            Object.entries(defaultAddressParts()).map(([k]) => [k, { enabled: false, required: false }]),
        ) as AddressPartsConfig
        expect(() => docWith({ ...base, parts: allOff })).toThrow()
    })

    it("missingRequiredAddressParts reports only blank required enabled parts", () => {
        const field = {
            ...base,
            parts: addressParts({ postalCode: { enabled: true, required: true } }),
        } as Extract<FormField, { type: "address" }>
        expect(missingRequiredAddressParts(field, { line1: "1 Main St" })).toEqual([
            "city",
            "postalCode",
            "country",
        ])
        expect(
            missingRequiredAddressParts(field, {
                line1: "1 Main St",
                city: "Lisbon",
                country: "Portugal",
                postalCode: "1000",
            }),
        ).toEqual([])
    })
})

describe("address parts JSON minification", () => {
    const base = { id: "addr", label: "Where?", type: "address" as const }

    it("new address fields carry no parts (defaults stay implicit)", () => {
        const field = createField("address", []) as Extract<FormField, { type: "address" }>
        expect(field.parts).toBeUndefined()
    })

    it("a default address question serializes without a parts block", () => {
        const doc = docWith(base)
        expect(serializeSchema(doc)).not.toContain('"parts"')
    })

    it("minifyAddressParts keeps only values that differ from the default", () => {
        // Unchanged default → nothing to persist.
        expect(minifyAddressParts(defaultAddressParts())).toBeUndefined()

        const custom = addressParts({
            line1: { enabled: true, required: false },
            state: { enabled: false, required: false },
            postalCode: { enabled: true, required: true },
        })
        expect(minifyAddressParts(custom)).toEqual({
            line1: { required: false },
            state: { enabled: false },
            postalCode: { required: true },
        })
    })

    it("getAddressParts round-trips a minified config", () => {
        const custom = addressParts({
            state: { enabled: false, required: false },
            postalCode: { enabled: true, required: true },
        })
        const field = {
            ...base,
            required: false,
            parts: minifyAddressParts(custom),
        } as Extract<FormField, { type: "address" }>
        expect(getAddressParts(field)).toEqual(custom)
    })

    it("a customized field stores only the deviating parts in JSON", () => {
        const doc = docWith({
            ...base,
            parts: minifyAddressParts(addressParts({ country: { enabled: false, required: false } })),
        })
        const json = serializeSchema(doc)
        expect(json).toContain('"country"')
        expect(json).not.toContain('"line1"')
        expect(json).not.toContain('"city"')
    })
})

describe("isBlankObject", () => {
    it("is true for objects with only blank/nullish values", () => {
        expect(isBlankObject({ a: "", b: "  ", c: null, d: undefined })).toBe(true)
    })
    it("is false when any value is meaningful", () => {
        expect(isBlankObject({ a: "", b: "x" })).toBe(false)
    })
})

describe("createField defaults for new types", () => {
    it("seeds linear_scale, ranking, and address with sane defaults", () => {
        const scale = createField("linear_scale", [])
        expect(scale).toMatchObject({ type: "linear_scale", min: 1, max: 5 })

        const ranking = createField("ranking", [])
        expect(ranking).toMatchObject({ type: "ranking" })
        expect((ranking as Extract<FormField, { type: "ranking" }>).options.length).toBeGreaterThanOrEqual(2)

        const address = createField("address", [])
        expect(address).toMatchObject({ type: "address" })
    })
})
