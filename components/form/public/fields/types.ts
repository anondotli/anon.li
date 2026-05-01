import type { FormField } from "@/lib/form-schema"

export type FieldPresentation = "spotlight" | "compact"

export interface FieldComponentProps<T extends FormField = FormField> {
    field: T
    value: unknown
    onChange: (next: unknown) => void
    /** Called when the field self-advances (single_select, rating) or when the user
     * presses Enter inside a single-line input. The flow controller decides whether
     * advancing actually moves to the next step. */
    onAdvance?: () => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
    /** Error message to render below the field, e.g. "This field is required". */
    error?: string | null
    /** Used to register a focus method so the parent can refocus on shake. */
    focusRef?: React.RefObject<{ focus: () => void } | null>
}

export interface FieldBehavior {
    /** When true, plain Enter inside the input advances to next step. */
    enterAdvances: boolean
    /** When true, the field auto-advances after a value is set. */
    autoAdvances: boolean
    /** When true, the flow accepts A–Z keys to pick options. */
    acceptsLetterKeys: boolean
    /** When true, the flow accepts 1-9 keys to pick a value. */
    acceptsNumberKeys: boolean
}

export function getFieldBehavior(field: FormField): FieldBehavior {
    switch (field.type) {
        case "long_text":
            return { enterAdvances: false, autoAdvances: false, acceptsLetterKeys: false, acceptsNumberKeys: false }
        case "single_select":
            return { enterAdvances: true, autoAdvances: true, acceptsLetterKeys: true, acceptsNumberKeys: false }
        case "multi_select":
            return { enterAdvances: true, autoAdvances: false, acceptsLetterKeys: true, acceptsNumberKeys: false }
        case "rating":
            return { enterAdvances: true, autoAdvances: true, acceptsLetterKeys: false, acceptsNumberKeys: true }
        case "file":
            return { enterAdvances: false, autoAdvances: false, acceptsLetterKeys: false, acceptsNumberKeys: false }
        default:
            return { enterAdvances: true, autoAdvances: false, acceptsLetterKeys: false, acceptsNumberKeys: false }
    }
}

export function asString(v: unknown): string {
    if (typeof v === "string") return v
    if (typeof v === "number") return String(v)
    return ""
}
