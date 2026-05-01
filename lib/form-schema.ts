import { z } from "zod"

const VisibleWhen = z.object({
    fieldId: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/),
    op: z.enum(["equals", "notEquals", "contains", "gt", "lt", "isEmpty", "isNotEmpty"]),
    value: z.union([z.string().max(500), z.number(), z.null()]).optional(),
})

// Shared fields for every block type.
const BaseField = z.object({
    id: z.string().min(1).max(64).regex(/^[a-zA-Z0-9_-]+$/, "field id must be alphanumeric"),
    label: z.string().min(1).max(300),
    required: z.boolean().default(false),
    helpText: z.string().max(500).optional(),
    visibleWhen: VisibleWhen.optional(),
})

const OptionList = z.array(z.string().min(1).max(200))

export const FormFieldSchema = z.discriminatedUnion("type", [
    BaseField.extend({
        type: z.literal("short_text"),
        maxLength: z.number().int().min(1).max(500).optional(),
        placeholder: z.string().max(200).optional(),
    }),
    BaseField.extend({
        type: z.literal("long_text"),
        maxLength: z.number().int().min(1).max(50_000).optional(),
        placeholder: z.string().max(200).optional(),
    }),
    BaseField.extend({
        type: z.literal("email"),
        placeholder: z.string().max(200).optional(),
    }),
    BaseField.extend({
        type: z.literal("number"),
        min: z.number().optional(),
        max: z.number().optional(),
        step: z.number().positive().optional(),
    }),
    BaseField.extend({
        type: z.literal("phone"),
        placeholder: z.string().max(200).optional(),
    }),
    BaseField.extend({
        type: z.literal("single_select"),
        options: OptionList.min(1).max(50),
    }),
    BaseField.extend({
        type: z.literal("multi_select"),
        options: OptionList.min(1).max(50),
    }),
    BaseField.extend({
        type: z.literal("dropdown"),
        options: OptionList.min(1).max(100),
    }),
    BaseField.extend({
        type: z.literal("rating"),
        max: z.number().int().min(3).max(10).default(5),
    }),
    BaseField.extend({
        type: z.literal("date"),
        min: z.string().optional(),
        max: z.string().optional(),
    }),
    BaseField.extend({
        type: z.literal("file"),
        maxFiles: z.number().int().min(1).max(20).default(1),
        maxFileSize: z.number().int().positive().max(250 * 1024 * 1024 * 1024).optional(),
        acceptedMimeTypes: z.array(z.string().max(100)).max(20).optional(),
    }),
])

export type FormField = z.infer<typeof FormFieldSchema>
export type FormFieldType = FormField["type"]
export type FormFieldVisibility = z.infer<typeof VisibleWhen>
export type FormFieldVisibilityOp = FormFieldVisibility["op"]

export const FormSchemaDoc = z.object({
    version: z.literal(1),
    displayMode: z.enum(["classic", "one_question"]).default("classic"),
    fields: z.array(FormFieldSchema).max(50),
    submitButtonText: z.string().min(1).max(60).default("Submit"),
    thankYouMessage: z.string().max(2000).optional(),
}).refine(
    (doc) => new Set(doc.fields.map((f) => f.id)).size === doc.fields.length,
    { message: "field ids must be unique", path: ["fields"] },
)

export type FormSchemaDoc = z.infer<typeof FormSchemaDoc>

export const EMPTY_FORM_SCHEMA: FormSchemaDoc = {
    version: 1,
    displayMode: "one_question",
    fields: [],
    submitButtonText: "Submit",
}

// Accepted answer payload: runtime validation for a submitted answers map.
// Keys are field ids from the schema; values are plain strings/numbers/arrays
// depending on the field type. File fields only carry file-id references —
// the actual content lives in the paired Drop.
export const FormAnswerValue = z.union([
    z.string().max(50_000),
    z.number(),
    z.boolean(),
    z.array(z.string().max(500)).max(100),
    z.null(),
])

export const FormAnswersPayload = z.record(z.string(), FormAnswerValue)

export type FormAnswers = z.infer<typeof FormAnswersPayload>

function isEmptyAnswer(value: unknown): boolean {
    return value === undefined || value === null || value === "" || (Array.isArray(value) && value.length === 0)
}

// Evaluate whether a field should be visible given the current answers map.
// A field with no `visibleWhen` is always visible. If the referenced field
// doesn't exist in the schema, we default to visible (safer than hiding).
export function isFieldVisible(field: FormField, answers: Record<string, unknown>): boolean {
    const rule = field.visibleWhen
    if (!rule) return true
    const target = answers[rule.fieldId]
    switch (rule.op) {
        case "isEmpty":
            return isEmptyAnswer(target)
        case "isNotEmpty":
            return !isEmptyAnswer(target)
        case "equals": {
            if (Array.isArray(target)) return target.map(String).includes(String(rule.value ?? ""))
            return String(target ?? "") === String(rule.value ?? "")
        }
        case "notEquals": {
            if (Array.isArray(target)) return !target.map(String).includes(String(rule.value ?? ""))
            return String(target ?? "") !== String(rule.value ?? "")
        }
        case "contains": {
            const needle = String(rule.value ?? "").toLowerCase()
            if (needle === "") return false
            if (Array.isArray(target)) return target.some((v) => String(v).toLowerCase().includes(needle))
            return String(target ?? "").toLowerCase().includes(needle)
        }
        case "gt": {
            const a = Number(target)
            const b = Number(rule.value)
            if (!Number.isFinite(a) || !Number.isFinite(b)) return false
            return a > b
        }
        case "lt": {
            const a = Number(target)
            const b = Number(rule.value)
            if (!Number.isFinite(a) || !Number.isFinite(b)) return false
            return a < b
        }
    }
}

// Validate a concrete answers object against a form schema. Returns the
// cleaned value set (strips unknown fields; normalizes empty values).
// Hidden fields (visibleWhen rule evaluates false) are skipped — their
// answers are dropped, and required checks do not apply to them.
// Throws a ZodError-compatible message on first invalid field.
export function validateAnswersAgainstSchema(
    schema: FormSchemaDoc,
    answers: Record<string, unknown>,
): Record<string, unknown> {
    const out: Record<string, unknown> = {}
    for (const field of schema.fields) {
        if (!isFieldVisible(field, answers)) continue
        const value = answers[field.id]
        if (isEmptyAnswer(value)) {
            if (field.required) {
                throw new Error(`Field "${field.label}" is required`)
            }
            continue
        }
        switch (field.type) {
            case "short_text":
            case "long_text":
            case "phone":
            case "email":
            case "date": {
                if (typeof value !== "string") throw new Error(`Field "${field.label}" must be text`)
                if (field.type === "email" && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                    throw new Error(`Field "${field.label}" must be a valid email`)
                }
                if ("maxLength" in field && field.maxLength && value.length > field.maxLength) {
                    throw new Error(`Field "${field.label}" exceeds ${field.maxLength} characters`)
                }
                out[field.id] = value
                break
            }
            case "number": {
                const num = typeof value === "number" ? value : Number(value)
                if (!Number.isFinite(num)) throw new Error(`Field "${field.label}" must be a number`)
                if (field.min !== undefined && num < field.min) throw new Error(`Field "${field.label}" must be ≥ ${field.min}`)
                if (field.max !== undefined && num > field.max) throw new Error(`Field "${field.label}" must be ≤ ${field.max}`)
                out[field.id] = num
                break
            }
            case "rating": {
                const num = typeof value === "number" ? value : Number(value)
                if (!Number.isInteger(num) || num < 1 || num > field.max) {
                    throw new Error(`Field "${field.label}" must be 1–${field.max}`)
                }
                out[field.id] = num
                break
            }
            case "single_select":
            case "dropdown": {
                if (typeof value !== "string" || !field.options.includes(value)) {
                    throw new Error(`Field "${field.label}" has an invalid choice`)
                }
                out[field.id] = value
                break
            }
            case "multi_select": {
                if (!Array.isArray(value)) throw new Error(`Field "${field.label}" must be a list`)
                for (const v of value) {
                    if (typeof v !== "string" || !field.options.includes(v)) {
                        throw new Error(`Field "${field.label}" has an invalid choice`)
                    }
                }
                out[field.id] = value
                break
            }
            case "file": {
                if (!Array.isArray(value)) throw new Error(`Field "${field.label}" must be a list of file ids`)
                if (value.length > field.maxFiles) throw new Error(`Field "${field.label}" allows at most ${field.maxFiles} files`)
                for (const v of value) {
                    if (typeof v !== "string") throw new Error(`Field "${field.label}" has invalid file references`)
                }
                out[field.id] = value
                break
            }
        }
    }
    return out
}

export function parseSchemaJson(raw: string): FormSchemaDoc {
    const parsed = JSON.parse(raw)
    return FormSchemaDoc.parse(parsed)
}

export function serializeSchema(schema: FormSchemaDoc): string {
    return JSON.stringify(schema, null, 2)
}
