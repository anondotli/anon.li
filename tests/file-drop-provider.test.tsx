/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

const push = vi.fn()
let pathname = "/"

vi.mock("next/navigation", () => ({
    useRouter: () => ({ push }),
    usePathname: () => pathname,
}))

import { FileDropProvider } from "@/components/drop/provider"
import { useFileDrop } from "@/hooks/use-file-drop"

function DroppedFileProbe() {
    const { droppedFiles } = useFileDrop()
    return <div>{droppedFiles?.map((file) => file.name).join(",") ?? "empty"}</div>
}

function dispatchFileDrop(file: File) {
    const event = new Event("drop", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "dataTransfer", {
        value: { files: [file] },
    })
    window.dispatchEvent(event)
}

beforeEach(() => {
    pathname = "/"
    push.mockClear()
})

afterEach(() => cleanup())

describe("FileDropProvider", () => {
    it("keeps globally dropped files while navigating to the guest uploader", async () => {
        render(
            <FileDropProvider>
                <DroppedFileProbe />
            </FileDropProvider>,
        )

        dispatchFileDrop(new File(["hello"], "hello.txt", { type: "text/plain" }))

        await waitFor(() => {
            expect(screen.getByText("hello.txt")).toBeTruthy()
            expect(push).toHaveBeenCalledWith("/drop/upload")
        })
    })

    it("keeps dashboard drops inside the authenticated upload surface", async () => {
        pathname = "/dashboard/drop"
        render(
            <FileDropProvider>
                <DroppedFileProbe />
            </FileDropProvider>,
        )

        dispatchFileDrop(new File(["report"], "report.pdf", { type: "application/pdf" }))

        await waitFor(() => expect(screen.getByText("report.pdf")).toBeTruthy())
        expect(push).not.toHaveBeenCalled()
    })

    it("does not intercept a drop already handled by the local drop zone", () => {
        render(
            <FileDropProvider>
                <DroppedFileProbe />
            </FileDropProvider>,
        )

        const event = new Event("drop", { bubbles: true, cancelable: true })
        Object.defineProperty(event, "dataTransfer", {
            value: { files: [new File(["local"], "local.txt")] },
        })
        event.preventDefault()
        fireEvent(window, event)

        expect(screen.getByText("empty")).toBeTruthy()
        expect(push).not.toHaveBeenCalled()
    })
})
