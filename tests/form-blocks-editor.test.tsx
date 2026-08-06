/**
 * @vitest-environment jsdom
 */
import { useState } from "react"
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
            title: "Test form",
            notifyOnSubmission: true,
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
            title: "Test form",
            notifyOnSubmission: true,
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
            title: "Test form",
            notifyOnSubmission: true,
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

    it("keeps the question expanded while editing its field id", async () => {
        const { FormBlocksEditor } = await import("@/components/form/dashboard/blocks-editor")
        const initial: FormSchemaDoc = {
            version: 1,
            title: "Test form",
            notifyOnSubmission: true,
            displayMode: "classic",
            submitButtonText: "Submit",
            fields: [
                { id: "name", type: "short_text", label: "Name", required: false },
            ],
        }

        // Controlled harness: feeds updated schemas back, like builder-page.
        function Harness() {
            const [schema, setSchema] = useState(initial)
            return <FormBlocksEditor schema={schema} onChange={setSchema} />
        }
        render(<Harness />)

        fireEvent.click(screen.getByRole("button", { name: "Expand Name" }))
        const idInput = screen.getByLabelText("Field ID")
        idInput.focus()
        fireEvent.change(idInput, { target: { value: "n" } })

        // The editor must stay open (Field ID still rendered) and the input
        // must keep focus — a collapsing/remounting block fails both.
        const idInputAfter = screen.queryByLabelText("Field ID")
        expect(idInputAfter).not.toBeNull()
        expect(document.activeElement).toBe(idInputAfter)
    })

    it("keeps a question expanded when it is moved", async () => {
        const { FormBlocksEditor } = await import("@/components/form/dashboard/blocks-editor")
        const initial: FormSchemaDoc = {
            version: 1,
            title: "Test form",
            notifyOnSubmission: true,
            displayMode: "classic",
            submitButtonText: "Submit",
            fields: [
                { id: "first", type: "short_text", label: "First", required: false },
                { id: "second", type: "short_text", label: "Second", required: false },
            ],
        }

        function Harness() {
            const [schema, setSchema] = useState(initial)
            return <FormBlocksEditor schema={schema} onChange={setSchema} />
        }
        render(<Harness />)

        fireEvent.click(screen.getByRole("button", { name: "Expand First" }))
        fireEvent.click(screen.getByLabelText("Move First down"))

        // Expansion follows the moved field, not the position it left.
        expect(screen.getByRole("button", { name: "Collapse First" })).toBeTruthy()
        expect(screen.getByRole("button", { name: "Expand Second" })).toBeTruthy()
    })

    it("updates visibility rules when a referenced field id is renamed", async () => {
        const { FormBlocksEditor } = await import("@/components/form/dashboard/blocks-editor")
        const initial: FormSchemaDoc = {
            version: 1,
            title: "Test form",
            notifyOnSubmission: true,
            displayMode: "classic",
            submitButtonText: "Submit",
            fields: [
                { id: "email", type: "email", label: "Email", required: false },
                {
                    id: "details",
                    type: "long_text",
                    label: "Details",
                    required: false,
                    visibleWhen: { fieldId: "email", op: "isNotEmpty" },
                },
            ],
        }

        const changes: FormSchemaDoc[] = []
        function Harness() {
            const [schema, setSchema] = useState(initial)
            return (
                <FormBlocksEditor
                    schema={schema}
                    onChange={(next) => {
                        changes.push(next)
                        setSchema(next)
                    }}
                />
            )
        }
        render(<Harness />)

        fireEvent.click(screen.getByRole("button", { name: "Expand Email" }))
        fireEvent.change(screen.getByLabelText("Field ID"), { target: { value: "work_email" } })

        const last = changes[changes.length - 1]
        expect(last).toBeDefined()
        expect(last?.fields[0]).toMatchObject({ id: "work_email" })
        expect(last?.fields[1]).toMatchObject({
            visibleWhen: { fieldId: "work_email", op: "isNotEmpty" },
        })
    })
})
