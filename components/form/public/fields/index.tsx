"use client"

import { forwardRef, useImperativeHandle, useRef } from "react"
import type { FormField } from "@/lib/form-schema"
import { SingleLineField, LongTextField } from "./text-fields"
import { SingleSelectField, MultiSelectField, DropdownField } from "./choice-fields"
import { RatingField } from "./rating-field"
import { FileField } from "./file-field"
import type { FieldPresentation } from "./types"

export { getFieldBehavior } from "./types"
export type { FieldBehavior, FieldPresentation } from "./types"
export { indexToLetter, letterToIndex } from "./letters"

export interface FieldHandle {
    focus: () => void
}

interface Props {
    field: FormField
    value: unknown
    onChange: (next: unknown) => void
    onAdvance?: () => void
    presentation: FieldPresentation
    disabled?: boolean
    autoFocus?: boolean
}

export const FieldInput = forwardRef<FieldHandle, Props>(function FieldInput(props, ref) {
    const innerRef = useRef<FieldHandle>(null)
    useImperativeHandle(ref, () => ({ focus: () => innerRef.current?.focus() }), [])

    const { field } = props
    switch (field.type) {
        case "short_text":
        case "email":
        case "number":
        case "phone":
        case "date":
            return <SingleLineField ref={innerRef} {...props} field={field} />
        case "long_text":
            return <LongTextField ref={innerRef} {...props} field={field} />
        case "single_select":
            return <SingleSelectField ref={innerRef} {...props} field={field} />
        case "multi_select":
            return <MultiSelectField ref={innerRef} {...props} field={field} />
        case "dropdown":
            return <DropdownField ref={innerRef} {...props} field={field} />
        case "rating":
            return <RatingField ref={innerRef} {...props} field={field} />
        case "file":
            return <FileField ref={innerRef} {...props} field={field} />
    }
})
