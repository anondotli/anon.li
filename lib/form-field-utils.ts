import type { FormField, FormFieldType } from "@/lib/form-schema"

export function createField(
    type: FormFieldType,
    fields: FormField[],
    maxFileSizeLimit?: number,
): FormField {
    return fieldForType(
        type,
        {
            id: uniqueFieldId(type, fields),
            label: "Untitled question",
            required: false,
        },
        maxFileSizeLimit,
    )
}

export function convertField(
    field: FormField,
    type: FormFieldType,
    fields: FormField[],
    maxFileSizeLimit?: number,
): FormField {
    if (field.type === type) return field
    return fieldForType(
        type,
        {
            id: field.id || uniqueFieldId(type, fields),
            label: field.label || "Untitled question",
            required: field.required,
            helpText: field.helpText,
        },
        maxFileSizeLimit,
    )
}

export function fieldForType(
    type: FormFieldType,
    base: Pick<FormField, "id" | "label" | "required" | "helpText">,
    maxFileSizeLimit?: number,
): FormField {
    switch (type) {
        case "single_select":
        case "multi_select":
        case "dropdown":
            return { ...base, type, options: ["Option 1", "Option 2"] }
        case "rating":
            return { ...base, type, max: 5 }
        case "file":
            return {
                ...base,
                type,
                maxFiles: 1,
                ...(maxFileSizeLimit ? { maxFileSize: maxFileSizeLimit } : {}),
            }
        default:
            return { ...base, type } as FormField
    }
}

export function uniqueFieldId(type: FormFieldType, fields: FormField[]): string {
    const base = type.replace(/_text$/, "")
    const used = new Set(fields.map((field) => field.id))
    let index = fields.length + 1
    let candidate = `${base}_${index}`
    while (used.has(candidate)) {
        index += 1
        candidate = `${base}_${index}`
    }
    return candidate
}

export function bytesToMegabytes(bytes: number): number {
    return Math.max(1, Math.round(bytes / (1024 * 1024)))
}

export function megabytesToBytes(megabytes: number): number {
    return Math.max(1, Math.round(megabytes * 1024 * 1024))
}
