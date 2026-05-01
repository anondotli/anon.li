/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { PublicFormData } from "@/components/form/public/submission-page"

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

vi.mock("@/lib/form-file-upload.client", () => ({
    uploadFormAttachments: vi.fn(),
}))

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
    vi.unstubAllGlobals()
})

describe("FormSubmissionPage Turnstile", () => {
    it("renders the captcha only after the user attempts to submit", async () => {
        const originalTurnstileSiteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
        process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = "site-key"
        vi.resetModules()

        try {
            const fetchMock = vi.fn().mockResolvedValue({
                ok: true,
                json: vi.fn().mockResolvedValue({}),
            })
            vi.stubGlobal("fetch", fetchMock)

            const { FormSubmissionPage } = await import("@/components/form/public/submission-page")
            const form: PublicFormData = {
                id: "form_1",
                title: "Feedback",
                description: null,
                schema: {
                    version: 1,
                    displayMode: "classic",
                    fields: [
                        {
                            id: "name",
                            type: "short_text",
                            label: "Name",
                            required: false,
                        },
                    ],
                    submitButtonText: "Send",
                },
                publicKey: "public-key",
                active: true,
                hideBranding: true,
                closesAt: null,
                customKey: false,
                salt: null,
                customKeyData: null,
                customKeyIv: null,
                allowFileUploads: false,
            }

            render(<FormSubmissionPage form={form} />)

            expect(screen.queryByRole("button", { name: "Complete captcha" })).toBeNull()

            fireEvent.click(screen.getByRole("button", { name: "Send" }))
            expect(fetchMock).not.toHaveBeenCalled()
            expect(screen.queryByText("Please complete the verification.")).toBeNull()
            expect(screen.getByRole("button", { name: "Complete captcha" })).toBeTruthy()

            fireEvent.click(screen.getByRole("button", { name: "Complete captcha" }))
            await waitFor(() => {
                expect(screen.queryByRole("button", { name: "Complete captcha" })).toBeNull()
            })

            await waitFor(() => {
                expect(fetchMock).toHaveBeenCalledWith(
                    "/api/v1/form/form_1/submit",
                    expect.objectContaining({
                        body: expect.stringContaining('"turnstileToken":"captcha-token"'),
                    }),
                )
            })
        } finally {
            if (originalTurnstileSiteKey === undefined) {
                delete process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
            } else {
                process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY = originalTurnstileSiteKey
            }
            vi.resetModules()
        }
    })
})
