import {
    describeAddressParts,
    isBlankObject,
    isFieldVisible,
    isIsoDateValue,
    missingRequiredAddressParts,
    type FormField,
    type FormSchemaDoc,
} from "@/lib/form-schema"

export function isFormAnswerEmpty(value: unknown): boolean {
    if (value === undefined || value === null) return true
    if (typeof value === "string") return value.trim() === ""
    if (Array.isArray(value)) return value.length === 0
    if (typeof value === "object") return isBlankObject(value as Record<string, unknown>)
    return false
}

function followsNumberStep(value: number, step: number, min?: number): boolean {
    const offset = (value - (min ?? 0)) / step
    return Math.abs(offset - Math.round(offset)) < 1e-9
}

export function validateFormFieldAnswer(field: FormField, value: unknown): string | null {
    if (isFormAnswerEmpty(value)) {
        return field.required ? "This question is required" : null
    }

    switch (field.type) {
        case "email":
            if (typeof value !== "string" || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
                return "Enter a valid email address"
            }
            return null
        case "short_text":
        case "long_text":
        case "phone":
            if (typeof value !== "string") return "Enter text"
            if ("maxLength" in field && field.maxLength && value.length > field.maxLength) {
                return `Keep this under ${field.maxLength} characters`
            }
            return null
        case "number": {
            const number = typeof value === "number" ? value : Number(value)
            if (!Number.isFinite(number)) return "Enter a valid number"
            if (field.min !== undefined && number < field.min) return `Must be at least ${field.min}`
            if (field.max !== undefined && number > field.max) return `Must be at most ${field.max}`
            if (field.step !== undefined && !followsNumberStep(number, field.step, field.min)) {
                return `Use increments of ${field.step}`
            }
            return null
        }
        case "date":
            if (typeof value !== "string" || !isIsoDateValue(value)) return "Enter a valid date"
            if (field.min && value < field.min) return `Choose ${field.min} or later`
            if (field.max && value > field.max) return `Choose ${field.max} or earlier`
            return null
        case "rating": {
            const number = typeof value === "number" ? value : Number(value)
            return Number.isInteger(number) && number >= 1 && number <= field.max
                ? null
                : `Choose a rating from 1 to ${field.max}`
        }
        case "linear_scale": {
            const number = typeof value === "number" ? value : Number(value)
            return Number.isInteger(number) && number >= field.min && number <= field.max
                ? null
                : `Choose a value from ${field.min} to ${field.max}`
        }
        case "single_select":
        case "dropdown":
            return typeof value === "string" && field.options.includes(value)
                ? null
                : "Pick a valid option"
        case "multi_select":
            if (!Array.isArray(value)) return "Pick at least one option"
            return value.every((option) => typeof option === "string" && field.options.includes(option))
                ? null
                : "Pick valid options"
        case "ranking":
            if (!Array.isArray(value) || value.length !== field.options.length) return "Rank every option"
            if (
                new Set(value).size !== field.options.length
                || !value.every((option) => typeof option === "string" && field.options.includes(option))
            ) {
                return "Rank every option exactly once"
            }
            return null
        case "address": {
            const missing = missingRequiredAddressParts(field, value)
            return missing.length > 0 ? `Enter ${describeAddressParts(missing)}` : null
        }
        case "file":
            if (!Array.isArray(value)) return "Attach files to continue"
            if (value.length > field.maxFiles) {
                return `Attach at most ${field.maxFiles} ${field.maxFiles === 1 ? "file" : "files"}`
            }
            return null
    }
}

export function collectFormFieldErrors(
    schema: FormSchemaDoc,
    answers: Record<string, unknown>,
): Record<string, string> {
    const errors: Record<string, string> = {}
    for (const field of schema.fields) {
        if (!isFieldVisible(field, answers)) continue
        const error = validateFormFieldAnswer(field, answers[field.id])
        if (error) errors[field.id] = error
    }
    return errors
}
