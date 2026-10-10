/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { FormField, FormSchemaDoc } from "@/lib/form-schema"

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

function schemaWith(field: FormField): FormSchemaDoc {
    return {
        version: 1,
        title: "Test form",
        notifyOnSubmission: true,
        displayMode: "classic",
        submitButtonText: "Submit",
        fields: [field],
    }
}

describe("FormBlocksEditor choice editing", () => {
    it("adds a default choice name that doesn't collide with an existing one", async () => {
        const { FormBlocksEditor } = await import("@/components/form/dashboard/blocks-editor")
        const onChange = vi.fn()
        render(
            <FormBlocksEditor
                schema={schemaWith({
                    id: "pick",
                    type: "single_select",
                    label: "Pick",
                    required: false,
                    // "Option 1" was removed earlier; "Option 3" would now collide.
                    options: ["Option 2", "Option 3"],
                })}
                onChange={onChange}
            />,
        )

        fireEvent.click(screen.getByRole("button", { name: "Expand Pick" }))
        fireEvent.click(screen.getByRole("button", { name: /add option/i }))

        expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({
            fields: [expect.objectContaining({ options: ["Option 2", "Option 3", "Option 4"] })],
        }))
    })

    it("does not let a ranking question drop below two choices", async () => {
        const { FormBlocksEditor } = await import("@/components/form/dashboard/blocks-editor")
        render(
            <FormBlocksEditor
                schema={schemaWith({ id: "rank", type: "ranking", label: "Rank", required: false, options: ["A", "B"] })}
                onChange={vi.fn()}
            />,
        )

        fireEvent.click(screen.getByRole("button", { name: "Expand Rank" }))
        expect((screen.getByRole("button", { name: "Remove option 1" }) as HTMLButtonElement).disabled).toBe(true)
        expect((screen.getByRole("button", { name: "Remove option 2" }) as HTMLButtonElement).disabled).toBe(true)
    })
})
