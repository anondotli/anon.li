/** @vitest-environment jsdom */
import { cleanup, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FormSchemaDoc } from "@/lib/form-schema"
import { OneQuestionFlow } from "@/components/form/public/one-question-flow"

afterEach(cleanup)

describe("one-question optional navigation", () => {
    it("lets a submitter skip an optional auto-advance choice", () => {
        const schema = FormSchemaDoc.parse({
            version: 1,
            displayMode: "one_question",
            submitButtonText: "Send",
            fields: [{
                id: "choice",
                type: "single_select",
                label: "Choose only if applicable",
                required: false,
                options: ["A", "B"],
            }],
        })

        render(
            <OneQuestionFlow
                schema={schema}
                answers={{}}
                onChange={vi.fn()}
                onSubmit={vi.fn()}
                submitButtonText="Send"
            />,
        )

        expect((screen.getByRole("button", { name: /send/i }) as HTMLButtonElement).disabled).toBe(false)
    })
})
