/** @vitest-environment jsdom */
import { useState } from "react"
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, describe, expect, it, vi } from "vitest"
import { FormSchemaDoc } from "@/lib/form-schema"
import { OneQuestionFlow } from "@/components/form/public/one-question-flow"

afterEach(() => {
    cleanup()
    vi.useRealTimers()
})

const schema = FormSchemaDoc.parse({
    version: 1,
    title: "Test form",
    displayMode: "one_question",
    submitButtonText: "Send",
    fields: [
        { id: "name", type: "short_text", label: "Your name", required: false },
        { id: "choice", type: "single_select", label: "Pick one", required: true, options: ["A", "B"] },
    ],
})

function Harness({ onSubmit }: { onSubmit: () => void }) {
    const [answers, setAnswers] = useState<Record<string, unknown>>({})
    return (
        <OneQuestionFlow
            schema={schema}
            answers={answers}
            onChange={setAnswers}
            onSubmit={onSubmit}
            submitButtonText="Send"
        />
    )
}

describe("one-question flow on the last question", () => {
    it("does not submit when a required auto-advance choice is clicked; Submit stays visible", () => {
        vi.useFakeTimers()
        const onSubmit = vi.fn()
        render(<Harness onSubmit={onSubmit} />)

        // Step 1 → step 2 (the last, required single-select).
        fireEvent.click(screen.getByRole("button", { name: /ok/i }))
        expect(screen.getByText("Pick one")).toBeTruthy()

        fireEvent.click(screen.getByRole("radio", { name: /A/ }))
        act(() => {
            vi.advanceTimersByTime(1_000)
        })
        expect(onSubmit).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole("button", { name: /send/i }))
        expect(onSubmit).toHaveBeenCalledTimes(1)
    })

    it("ignores Escape that an open control already handled", () => {
        render(<Harness onSubmit={vi.fn()} />)
        fireEvent.click(screen.getByRole("button", { name: /ok/i }))
        expect(screen.getByText("Pick one")).toBeTruthy()

        const handled = new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true })
        handled.preventDefault()
        act(() => {
            document.body.dispatchEvent(handled)
        })
        expect(screen.getByText("Pick one")).toBeTruthy()

        act(() => {
            document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }))
        })
        expect(screen.getByText("Your name")).toBeTruthy()
    })
})
