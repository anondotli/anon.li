/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import type { FormSchemaDoc } from "@/lib/form-schema"

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

describe("FormBlocksEditor", () => {
    it("reorders questions with accessible move controls", async () => {
        const { FormBlocksEditor } = await import("@/components/form/dashboard/blocks-editor")
        const schema: FormSchemaDoc = {
            version: 1,
            displayMode: "classic",
            submitButtonText: "Submit",
            fields: [
                { id: "first", type: "short_text", label: "First", required: false },
                { id: "second", type: "short_text", label: "Second", required: false },
            ],
        }
        const onChange = vi.fn()

        render(<FormBlocksEditor schema={schema} onChange={onChange} />)

        fireEvent.click(screen.getByRole("button", { name: "Expand First" }))
        fireEvent.click(screen.getByLabelText("Move First down"))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            fields: [
                expect.objectContaining({ id: "second" }),
                expect.objectContaining({ id: "first" }),
            ],
        }))
    })

    it("writes max file size in bytes from the MB editor", async () => {
        const { FormBlocksEditor } = await import("@/components/form/dashboard/blocks-editor")
        const schema: FormSchemaDoc = {
            version: 1,
            displayMode: "classic",
            submitButtonText: "Submit",
            fields: [
                { id: "files", type: "file", label: "Files", required: false, maxFiles: 1 },
            ],
        }
        const onChange = vi.fn()

        render(<FormBlocksEditor schema={schema} onChange={onChange} maxFileSizeLimit={10 * 1024 * 1024} />)

        fireEvent.click(screen.getByRole("button", { name: "Expand Files" }))
        fireEvent.change(screen.getByLabelText("Max size (MB)"), { target: { value: "2" } })

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            fields: [
                expect.objectContaining({
                    id: "files",
                    maxFileSize: 2 * 1024 * 1024,
                }),
            ],
        }))
    })

    it("defaults new file questions to the provided max file size limit", async () => {
        const { FormBlocksEditor } = await import("@/components/form/dashboard/blocks-editor")
        const schema: FormSchemaDoc = {
            version: 1,
            displayMode: "classic",
            submitButtonText: "Submit",
            fields: [],
        }
        const onChange = vi.fn()

        render(<FormBlocksEditor schema={schema} onChange={onChange} maxFileSizeLimit={10 * 1024 * 1024} />)

        fireEvent.click(screen.getByRole("button", { name: "File upload" }))

        expect(onChange).toHaveBeenCalledWith(expect.objectContaining({
            fields: [
                expect.objectContaining({
                    type: "file",
                    maxFileSize: 10 * 1024 * 1024,
                }),
            ],
        }))
    })
})
