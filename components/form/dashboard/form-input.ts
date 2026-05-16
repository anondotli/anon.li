import { FormSchemaDoc, type FormField, type FormSchemaDoc as FormSchemaDocType } from "@/lib/form-schema"
import type { PasswordPayload } from "./form-password-dialog"

export type NormalizedFormInput = {
    title: string
    description: string | null
    schema: FormSchemaDocType
    allowFileUploads: boolean
    maxSubmissions: number | null
    closesAt: string | null
    hideBranding: boolean
    notifyOnSubmission: boolean
    disabledByUser: boolean
    customKey?: boolean
    salt?: string | null
    customKeyData?: string | null
    customKeyIv?: string | null
    customKeyVerifier?: string | null
}

export function buildFormInput({
    title,
    description,
    schema,
    hideBranding,
    maxSubmissions,
    closesAt,
    notifyOnSubmission = true,
    disabledByUser = false,
    passwordEnabled = false,
    passwordPayload = null,
    passwordChanged = false,
    isEdit = false,
}: {
    title: string
    description: string
    schema: FormSchemaDocType | null
    hideBranding: boolean
    maxSubmissions: string
    closesAt: string
    notifyOnSubmission?: boolean
    disabledByUser?: boolean
    passwordEnabled?: boolean
    passwordPayload?: PasswordPayload | null
    passwordChanged?: boolean
    isEdit?: boolean
}): { data: NormalizedFormInput } | { error: string } {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return { error: "Please add a title" }
    if (!schema) return { error: "Fix the JSON before saving" }

    const normalized = normalizeSchemaForSave(schema)
    const parsedSchema = FormSchemaDoc.safeParse(normalized)
    if (!parsedSchema.success) {
        return { error: friendlyZodError(parsedSchema.error.issues, normalized) }
    }

    const allowFileUploads = parsedSchema.data.fields.some((field) => field.type === "file")

    const parsedMaxSubmissions = parseOptionalPositiveInt(maxSubmissions, "Max submissions")
    if ("error" in parsedMaxSubmissions) return parsedMaxSubmissions

    const parsedClosesAt = parseDateTimeLocal(closesAt)
    if ("error" in parsedClosesAt) return parsedClosesAt

    if (passwordEnabled && passwordChanged && !passwordPayload) {
        return { error: "Set a password before saving" }
    }
    if (!isEdit && passwordEnabled && !passwordPayload) {
        return { error: "Set a password before saving" }
    }

    const passwordFields: Pick<NormalizedFormInput, "customKey" | "salt" | "customKeyData" | "customKeyIv" | "customKeyVerifier"> = {}
    if (!isEdit || passwordChanged) {
        passwordFields.customKey = passwordEnabled
        passwordFields.salt = null
        passwordFields.customKeyData = null
        passwordFields.customKeyIv = null
        passwordFields.customKeyVerifier = null
    }

    if (passwordEnabled && (!isEdit || passwordChanged) && passwordPayload) {
        passwordFields.salt = passwordPayload.salt
        passwordFields.customKeyData = passwordPayload.customKeyData
        passwordFields.customKeyIv = passwordPayload.customKeyIv
        passwordFields.customKeyVerifier = passwordPayload.customKeyVerifier
    }

    return {
        data: {
            title: trimmedTitle,
            description: description.trim() || null,
            schema: parsedSchema.data,
            allowFileUploads,
            maxSubmissions: parsedMaxSubmissions.value,
            closesAt: parsedClosesAt.value,
            hideBranding,
            notifyOnSubmission,
            disabledByUser,
            ...passwordFields,
        },
    }
}

function normalizeSchemaForSave(schema: FormSchemaDocType): FormSchemaDocType {
    return {
        ...schema,
        submitButtonText: schema.submitButtonText.trim() || "Submit",
        thankYouMessage: schema.thankYouMessage?.trim() || undefined,
        fields: schema.fields.map((field) => {
            const trimmedHelp = field.helpText?.trim()
            const base = {
                ...field,
                label: field.label.trim(),
                helpText: trimmedHelp ? trimmedHelp : undefined,
            } as FormField
            if (
                base.type === "single_select" ||
                base.type === "multi_select" ||
                base.type === "dropdown"
            ) {
                const cleaned = base.options
                    .map((opt: string) => opt.trim())
                    .filter((opt: string) => opt.length > 0)
                return { ...base, options: cleaned.length > 0 ? cleaned : ["Option 1"] }
            }
            return base
        }),
    }
}

function friendlyZodError(
    issues: readonly { path: PropertyKey[]; message: string }[],
    schema: FormSchemaDocType,
): string {
    const issue = issues[0]
    if (!issue) return "Invalid form schema"
    const path = issue.path
    if (path[0] === "fields" && typeof path[1] === "number") {
        const fieldIndex = path[1]
        const field = schema.fields[fieldIndex]
        const labelOrIndex = field?.label?.trim() || `Question ${fieldIndex + 1}`
        const segment = path[2]
        if (segment === "label") return `Add a label to "${labelOrIndex}"`
        if (segment === "options") return `"${labelOrIndex}" needs at least one choice`
        if (segment === "id") return `"${labelOrIndex}" needs a valid field ID`
        return `Fix "${labelOrIndex}": ${issue.message}`
    }
    if (path[0] === "submitButtonText") return "Submit button needs a label"
    return issue.message
}

function parseOptionalPositiveInt(value: string, label: string): { value: number | null } | { error: string } {
    const trimmed = value.trim()
    if (!trimmed) return { value: null }
    const parsed = Number(trimmed)
    if (!Number.isInteger(parsed) || parsed <= 0) {
        return { error: `${label} must be a positive whole number` }
    }
    return { value: parsed }
}

function parseDateTimeLocal(value: string): { value: string | null } | { error: string } {
    if (!value) return { value: null }
    const parsed = new Date(value)
    if (Number.isNaN(parsed.getTime())) return { error: "Close date is invalid" }
    return { value: parsed.toISOString() }
}
