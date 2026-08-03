import { describe, expect, it } from "vitest"

import { collectFormFieldErrors, validateFormFieldAnswer } from "@/lib/form-answer-validation"
import { FormSchemaDoc, type FormField } from "@/lib/form-schema"

describe("public form answer validation", () => {
    it("uses the same complete constraints in focused and final submission flows", () => {
        const numberField: Extract<FormField, { type: "number" }> = {
            id: "amount",
            type: "number",
            label: "Amount",
            required: true,
            min: 1,
            max: 10,
            step: 0.5,
        }
        const choiceField: Extract<FormField, { type: "single_select" }> = {
            id: "choice",
            type: "single_select",
            label: "Choice",
            required: true,
            options: ["A", "B"],
        }

        expect(validateFormFieldAnswer(numberField, Number.POSITIVE_INFINITY)).toBe("Enter a valid number")
        expect(validateFormFieldAnswer(numberField, 1.25)).toBe("Use increments of 0.5")
        expect(validateFormFieldAnswer(choiceField, "forged")).toBe("Pick a valid option")
    })

    it("rejects duplicate or incomplete ranking values", () => {
        const field: Extract<FormField, { type: "ranking" }> = {
            id: "ranking",
            type: "ranking",
            label: "Rank",
            required: true,
            options: ["A", "B", "C"],
        }

        expect(validateFormFieldAnswer(field, ["A", "A", "B"]))
            .toBe("Rank every option exactly once")
        expect(validateFormFieldAnswer(field, ["A", "B"]))
            .toBe("Rank every option")
        expect(validateFormFieldAnswer(field, ["C", "A", "B"])).toBeNull()
    })

    it("validates only currently visible questions", () => {
        const schema = FormSchemaDoc.parse({
            version: 1,
            fields: [
                { id: "show", type: "single_select", label: "Show?", required: true, options: ["yes", "no"] },
                {
                    id: "details",
                    type: "short_text",
                    label: "Details",
                    required: true,
                    visibleWhen: { fieldId: "show", op: "equals", value: "yes" },
                },
            ],
        })

        expect(collectFormFieldErrors(schema, { show: "no" })).toEqual({})
        expect(collectFormFieldErrors(schema, { show: "yes" })).toEqual({
            details: "This question is required",
        })
    })
})
