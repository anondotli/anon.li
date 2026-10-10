/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { ComponentProps } from "react"
import type { FormSubmissionPage } from "@/components/form/public/submission-page"
import type { FormField } from "@/lib/form-schema"

type PublicFormData = ComponentProps<typeof FormSubmissionPage>["form"]

const uploadMocks = vi.hoisted(() => ({
    uploadFormAttachments: vi.fn(),
    revokeFormAttachmentUpload: vi.fn(),
}))

vi.mock("@/components/ui/turnstile", () => ({
    Turnstile: ({ onVerify }: { onVerify: (token: string) => void }) => (
        <button type="button" onClick={() => onVerify("captcha-token")}>
            Complete captcha
        </button>
    ),
}))
vi.mock("@/lib/crypto/asymmetric", () => ({
    encryptForForm: vi.fn().mockResolvedValue({
        ephemeralPubKey: "A".repeat(87),
        iv: "I".repeat(16),
        encryptedPayload: "encrypted",
    }),
}))
vi.mock("@/lib/form-file-upload.client", () => uploadMocks)

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

function formWith(fields: FormField[]): PublicFormData {
    return {
        id: "form_1",
        title: "Uploads",
        description: null,
        schema: {
            version: 1,
            title: "Uploads",
            notifyOnSubmission: true,
            displayMode: "classic",
            fields,
            submitButtonText: "Send",
        },
        fieldCount: fields.length,
        publicKey: "public-key",
        active: true,
        hideBranding: true,
        closesAt: null,
        customKey: false,
        salt: null,
        customKeyData: null,
        customKeyIv: null,
        allowFileUploads: true,
    }
}

function attach(fileInput: HTMLInputElement, count: number) {
    const files = Array.from({ length: count }, (_, i) => new File(["x"], `f${i}.txt`, { type: "text/plain" }))
    fireEvent.change(fileInput, { target: { files } })
}

async function submitWithCaptcha() {
    fireEvent.click(screen.getByRole("button", { name: "Send" }))
    fireEvent.click(await screen.findByRole("button", { name: "Complete captcha" }))
}

describe("FormSubmissionPage attachments", () => {
    it("revokes the uploaded attachment when the submission is rejected", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
            ok: false,
            status: 403,
            json: vi.fn().mockResolvedValue({ error: { message: "Form is no longer accepting submissions" } }),
        }))
        uploadMocks.uploadFormAttachments.mockResolvedValue({
            dropId: "drop_1",
            uploadToken: "upload-token",
            keyString: "key",
            files: [{
                fieldId: "docs",
                fieldLabel: "Docs",
                fileId: "file_1",
                originalName: "f0.txt",
                originalSize: 1,
                encryptedSize: 29,
                mimeType: "text/plain",
            }],
        })

        const { FormSubmissionPage } = await import("@/components/form/public/submission-page")
        const { container } = render(
            <FormSubmissionPage form={formWith([
                { id: "docs", type: "file", label: "Docs", required: false, maxFiles: 1 },
            ])} />,
        )
        attach(container.querySelector("input[type=file]") as HTMLInputElement, 1)
        await submitWithCaptcha()

        await screen.findByText("Form is no longer accepting submissions")
        expect(uploadMocks.revokeFormAttachmentUpload).toHaveBeenCalledWith("form_1", "upload-token")
    })

    it("explains the per-submission file limit before uploading anything", async () => {
        vi.stubGlobal("fetch", vi.fn())
        const { FormSubmissionPage } = await import("@/components/form/public/submission-page")
        const { container } = render(
            <FormSubmissionPage form={formWith([
                { id: "a", type: "file", label: "A", required: false, maxFiles: 20 },
                { id: "b", type: "file", label: "B", required: false, maxFiles: 20 },
            ])} />,
        )
        const inputs = container.querySelectorAll("input[type=file]")
        attach(inputs[0] as HTMLInputElement, 15)
        attach(inputs[1] as HTMLInputElement, 10)
        await submitWithCaptcha()

        await screen.findByText(/at most 20 files per submission/)
        expect(uploadMocks.uploadFormAttachments).not.toHaveBeenCalled()
    })

    it("pre-validates answers (with pending file ids) without blocking a valid upload", async () => {
        vi.stubGlobal("fetch", vi.fn())
        uploadMocks.uploadFormAttachments.mockRejectedValue(new Error("Upload cancelled"))
        const { FormSubmissionPage } = await import("@/components/form/public/submission-page")
        const { container } = render(
            <FormSubmissionPage form={formWith([
                { id: "docs", type: "file", label: "Docs", required: true, maxFiles: 1 },
            ])} />,
        )
        attach(container.querySelector("input[type=file]") as HTMLInputElement, 1)
        await waitFor(() => expect(screen.getByText("f0.txt")).toBeTruthy())
        await submitWithCaptcha()

        await waitFor(() => expect(uploadMocks.uploadFormAttachments).toHaveBeenCalledTimes(1))
    })
})
