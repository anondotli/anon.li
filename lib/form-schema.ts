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

// ---- Address composite config ---------------------------------------------
// The address question is built from a fixed set of parts; the form builder
// chooses which to collect and which of those are required.

export const ADDRESS_PARTS = ["line1", "line2", "city", "state", "postalCode", "country"] as const
export type AddressPart = (typeof ADDRESS_PARTS)[number]

/** Display + autofill metadata for each address part (single source of truth). */
export const ADDRESS_PART_META: Record<AddressPart, { label: string; autoComplete: string }> = {
    line1: { label: "Address line 1", autoComplete: "address-line1" },
    line2: { label: "Address line 2", autoComplete: "address-line2" },
    city: { label: "City", autoComplete: "address-level2" },
    state: { label: "State / Region", autoComplete: "address-level1" },
    postalCode: { label: "Postal code", autoComplete: "postal-code" },
    country: { label: "Country", autoComplete: "country-name" },
}

/** Normalized per-part config — always fully specified once read. */
export interface AddressPartConfig {
    enabled: boolean
    required: boolean
}
export type AddressPartsConfig = Record<AddressPart, AddressPartConfig>

// Stored shape: both keys optional so only values that differ from the default
// are persisted. Absent keys fall back to DEFAULT_ADDRESS_PARTS on read, which
// keeps the schema JSON small (a default address stores no `parts` at all).
const StoredAddressPartSchema = z.object({
    enabled: z.boolean().optional(),
    required: z.boolean().optional(),
})
const AddressPartsConfigSchema = z.object({
    line1: StoredAddressPartSchema.optional(),
    line2: StoredAddressPartSchema.optional(),
    city: StoredAddressPartSchema.optional(),
    state: StoredAddressPartSchema.optional(),
    postalCode: StoredAddressPartSchema.optional(),
    country: StoredAddressPartSchema.optional(),
})
export type StoredAddressParts = z.infer<typeof AddressPartsConfigSchema>

/** Fresh default config — reproduces the original fixed address layout. */
export function defaultAddressParts(): AddressPartsConfig {
    return {
        line1: { enabled: true, required: true },
        line2: { enabled: true, required: false },
        city: { enabled: true, required: true },
        state: { enabled: true, required: false },
        postalCode: { enabled: true, required: false },
        country: { enabled: true, required: true },
    }
}

/** Shared read-only fallback for address fields stored before parts existed. */
export const DEFAULT_ADDRESS_PARTS: AddressPartsConfig = defaultAddressParts()

const FormFieldSchema = z.discriminatedUnion("type", [
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
    BaseField.extend({
        type: z.literal("linear_scale"),
        // Scale start (0 or 1) and end (2–11). The bounds guarantee max > min.
        min: z.number().int().min(0).max(1).default(1),
        max: z.number().int().min(2).max(11).default(5),
        minLabel: z.string().max(50).optional(),
        maxLabel: z.string().max(50).optional(),
    }),
    BaseField.extend({
        type: z.literal("ranking"),
        options: OptionList.min(2).max(20),
    }),
    BaseField.extend({
        type: z.literal("address"),
        // Which parts to collect and which are required. Optional for back-compat
        // with addresses created before this was configurable (see getAddressParts).
        parts: AddressPartsConfigSchema.optional(),
    }),
])

type AddressField = Extract<FormField, { type: "address" }>

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
).refine(
    (doc) =>
        doc.fields.every(
            (f) => f.type !== "address" || enabledAddressParts(getAddressParts(f)).length > 0,
        ),
    { message: "address questions must collect at least one field", path: ["fields"] },
)

export type FormSchemaDoc = z.infer<typeof FormSchemaDoc>

export const EMPTY_FORM_SCHEMA: FormSchemaDoc = {
    version: 1,
    displayMode: "one_question",
    fields: [],
    submitButtonText: "Submit",
}

function isEmptyAnswer(value: unknown): boolean {
    if (value === undefined || value === null || value === "") return true
    if (Array.isArray(value)) return value.length === 0
    // Composite answers (e.g. address) are empty when every part is blank.
    if (typeof value === "object") return isBlankObject(value as Record<string, unknown>)
    return false
}

/** True when a plain object has no value beyond blank/whitespace strings. */
export function isBlankObject(obj: Record<string, unknown>): boolean {
    return Object.values(obj).every((v) => v === null || v === undefined || String(v).trim() === "")
}

// ---- Address composite -----------------------------------------------------

/** Effective part config — merges the stored deviations over the default. */
export function getAddressParts(field: AddressField): AddressPartsConfig {
    const stored = field.parts
    if (!stored) return DEFAULT_ADDRESS_PARTS
    const out = {} as AddressPartsConfig
    for (const part of ADDRESS_PARTS) {
        const base = DEFAULT_ADDRESS_PARTS[part]
        const override = stored[part]
        out[part] = {
            enabled: override?.enabled ?? base.enabled,
            required: override?.required ?? base.required,
        }
    }
    return out
}

/**
 * Drop everything that matches the default so only customizations are stored.
 * Returns undefined when the config is entirely default (so `parts` is omitted).
 */
export function minifyAddressParts(parts: AddressPartsConfig): StoredAddressParts | undefined {
    const out: StoredAddressParts = {}
    for (const part of ADDRESS_PARTS) {
        const base = DEFAULT_ADDRESS_PARTS[part]
        const entry: { enabled?: boolean; required?: boolean } = {}
        if (parts[part].enabled !== base.enabled) entry.enabled = parts[part].enabled
        if (parts[part].required !== base.required) entry.required = parts[part].required
        if (entry.enabled !== undefined || entry.required !== undefined) out[part] = entry
    }
    return Object.keys(out).length > 0 ? out : undefined
}

/** Address parts that are turned on, in canonical order. */
export function enabledAddressParts(parts: AddressPartsConfig): AddressPart[] {
    return ADDRESS_PARTS.filter((part) => parts[part].enabled)
}

/** Enabled-and-required parts that are blank in the given answer value. */
export function missingRequiredAddressParts(field: AddressField, value: unknown): AddressPart[] {
    const parts = getAddressParts(field)
    const addr =
        value && typeof value === "object" && !Array.isArray(value)
            ? (value as Record<string, unknown>)
            : {}
    return ADDRESS_PARTS.filter((part) => {
        const cfg = parts[part]
        if (!cfg.enabled || !cfg.required) return false
        const v = addr[part]
        return !(typeof v === "string" && v.trim() !== "")
    })
}

/** Human-readable, comma-joined list of address part names. */
export function describeAddressParts(parts: AddressPart[]): string {
    return parts.map((part) => ADDRESS_PART_META[part].label.toLowerCase()).join(", ")
}

const AddressValueSchema = z.object({
    line1: z.string().max(200).optional(),
    line2: z.string().max(200).optional(),
    city: z.string().max(120).optional(),
    state: z.string().max(120).optional(),
    postalCode: z.string().max(40).optional(),
    country: z.string().max(120).optional(),
})

export type AddressValue = z.infer<typeof AddressValueSchema>

/**
 * Parse + trim an arbitrary answer into a clean address object. Only keeps the
 * parts the form actually asks for. Throws on bad shape.
 */
export function parseAddressValue(
    value: unknown,
    label: string,
    parts: AddressPartsConfig = DEFAULT_ADDRESS_PARTS,
): AddressValue {
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
        throw new Error(`Field "${label}" must be an address`)
    }
    const parsed = AddressValueSchema.parse(value)
    const out: AddressValue = {}
    for (const part of ADDRESS_PARTS) {
        if (!parts[part].enabled) continue
        const v = parsed[part]
        if (v && v.trim() !== "") out[part] = v.trim()
    }
    return out
}

/** Single-line, comma-joined rendering of an address (skips blank parts). */
export function formatAddress(value: AddressValue): string {
    return ADDRESS_PARTS.map((part) => value[part])
        .filter((v): v is string => Boolean(v && v.trim()))
        .join(", ")
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
            case "linear_scale": {
                const num = typeof value === "number" ? value : Number(value)
                if (!Number.isInteger(num) || num < field.min || num > field.max) {
                    throw new Error(`Field "${field.label}" must be ${field.min}–${field.max}`)
                }
                out[field.id] = num
                break
            }
            case "ranking": {
                if (!Array.isArray(value)) throw new Error(`Field "${field.label}" must be a ranked list`)
                const seen = new Set<string>()
                for (const v of value) {
                    if (typeof v !== "string" || !field.options.includes(v) || seen.has(v)) {
                        throw new Error(`Field "${field.label}" has an invalid ranking`)
                    }
                    seen.add(v)
                }
                if (seen.size !== field.options.length) {
                    throw new Error(`Field "${field.label}" must rank every option`)
                }
                out[field.id] = value
                break
            }
            case "address": {
                // Only reached for a non-empty answer (the empty case is handled
                // above), so enforce required parts regardless of field.required —
                // once an address is started, its required parts must be filled.
                const address = parseAddressValue(value, field.label, getAddressParts(field))
                const missing = missingRequiredAddressParts(field, address)
                if (missing.length > 0) {
                    throw new Error(`Field "${field.label}" needs ${describeAddressParts(missing)}`)
                }
                out[field.id] = address
                break
            }
        }
    }
    return out
}

export function serializeSchema(schema: FormSchemaDoc): string {
    return JSON.stringify(schema, null, 2)
}
