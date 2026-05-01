/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import type { FormSchemaDoc } from "@/lib/form-schema"

const actionMocks = vi.hoisted(() => ({
    createFormAction: vi.fn(),
    updateFormAction: vi.fn(),
}))

const routerMocks = vi.hoisted(() => ({
    push: vi.fn(),
    refresh: vi.fn(),
}))

const vaultMocks = vi.hoisted(() => ({
    getVaultKey: vi.fn(),
}))

vi.mock("next/navigation", () => ({
    useRouter: () => ({
        push: routerMocks.push,
        refresh: routerMocks.refresh,
        back: vi.fn(),
        replace: vi.fn(),
        forward: vi.fn(),
        prefetch: vi.fn(),
    }),
}))

vi.mock("sonner", () => ({
    toast: {
        success: vi.fn(),
        error: vi.fn(),
    },
}))

vi.mock("@/actions/form", () => ({
    createFormAction: actionMocks.createFormAction,
    updateFormAction: actionMocks.updateFormAction,
}))

vi.mock("@/components/vault/vault-provider", () => ({
    useVault: () => ({
        status: "locked",
        vaultId: null,
        vaultGeneration: null,
        getVaultKey: vaultMocks.getVaultKey,
    }),
}))

vi.mock("@/lib/crypto/asymmetric", () => ({
    generateFormKeypair: vi.fn(),
}))

vi.mock("@/lib/vault/crypto", () => ({
    base64UrlToArrayBuffer: vi.fn(),
    wrapVaultPayload: vi.fn(),
}))

vi.mock("@/lib/crypto.client", () => ({
    cryptoService: {
        generateSalt: () => "A".repeat(43),
        arrayBufferToBase64Url: () => "V".repeat(43),
        encryptKeyWithPassword: vi.fn().mockResolvedValue({
            encryptedKey: "x".repeat(79),
            iv: "I".repeat(16),
            salt: "S".repeat(43),
        }),
    },
}))

vi.mock("@/components/upgrade/upgrade-required-dialog", () => ({
    UpgradeRequiredDialog: () => null,
}))

const schema: FormSchemaDoc = {
    version: 1,
    displayMode: "classic",
    submitButtonText: "Send",
    thankYouMessage: "Received.",
    fields: [
        {
            id: "email",
            type: "email",
            label: "Email",
            required: true,
        },
    ],
}

beforeEach(() => {
    actionMocks.updateFormAction.mockResolvedValue({ success: true, data: { id: "abc123def456" } })
})

afterEach(() => {
    cleanup()
    vi.clearAllMocks()
})

describe("FormBuilderPage", () => {
    it("saves an existing form without requiring the vault", async () => {
        const { FormBuilderPage } = await import("@/components/form/dashboard/builder-page")

        render(
            <FormBuilderPage
                mode="edit"
                limits={{ removeBranding: true, customKey: true, maxSubmissionFileSize: 10_000_000 }}
                initialForm={{
                    id: "abc123def456",
                    title: "Original form",
                    description: "Original description",
                    schema,
                    allowFileUploads: false,
                    maxSubmissions: null,
                    closesAt: null,
                    hideBranding: false,
                    submissionsCount: 2,
                    notifyOnSubmission: true,
                    customKey: false,
                    disabledByUser: false,
                }}
            />,
        )

        fireEvent.change(screen.getByLabelText("Form title"), {
            target: { value: "Edited form" },
        })
        fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

        await waitFor(() => {
            expect(actionMocks.updateFormAction).toHaveBeenCalledWith(
                "abc123def456",
                expect.objectContaining({
                    title: "Edited form",
                    schema,
                    notifyOnSubmission: true,
                }),
            )
        })

        expect(actionMocks.createFormAction).not.toHaveBeenCalled()
        expect(vaultMocks.getVaultKey).not.toHaveBeenCalled()
        expect(routerMocks.refresh).toHaveBeenCalled()
    })

    it("derives file uploads from file fields", async () => {
        const { buildFormInput } = await import("@/components/form/dashboard/builder-page")
        const result = buildFormInput({
            title: "File form",
            description: "",
            schema: {
                version: 1,
                displayMode: "classic",
                submitButtonText: "Submit",
                fields: [
                    {
                        id: "files",
                        type: "file",
                        label: "Files",
                        required: false,
                        maxFiles: 1,
                        maxFileSize: 2 * 1024 * 1024,
                    },
                ],
            },
            hideBranding: false,
            maxSubmissions: "",
            closesAt: "",
        })

        expect("data" in result).toBe(true)
        if ("data" in result) {
            expect(result.data.allowFileUploads).toBe(true)
            expect(result.data.schema.fields[0]).toEqual(expect.objectContaining({ maxFileSize: 2 * 1024 * 1024 }))
        }
    })

    it("persists the submission notification toggle", async () => {
        const { buildFormInput } = await import("@/components/form/dashboard/builder-page")
        const result = buildFormInput({
            title: "Quiet form",
            description: "",
            schema,
            hideBranding: false,
            maxSubmissions: "",
            closesAt: "",
            notifyOnSubmission: false,
        })

        expect("data" in result).toBe(true)
        if ("data" in result) {
            expect(result.data.notifyOnSubmission).toBe(false)
        }
    })

    it("persists customKey=true when a brand-new password is applied through the dialog", async () => {
        const { FormBuilderPage } = await import("@/components/form/dashboard/builder-page")

        actionMocks.updateFormAction.mockResolvedValue({ success: true, data: { id: "abc123def456" } })

        render(
            <FormBuilderPage
                mode="edit"
                limits={{ removeBranding: true, customKey: true, maxSubmissionFileSize: 10_000_000 }}
                initialForm={{
                    id: "abc123def456",
                    title: "Form to protect",
                    description: null,
                    schema,
                    allowFileUploads: false,
                    maxSubmissions: null,
                    closesAt: null,
                    hideBranding: false,
                    submissionsCount: 0,
                    notifyOnSubmission: true,
                    customKey: false,
                    disabledByUser: false,
                }}
            />,
        )

        // The settings panel groups are collapsed by default; expand "Access" first.
        fireEvent.click(screen.getByRole("button", { name: /^Access/ }))

        // Toggle password on — opens the password dialog.
        const toggle = await screen.findByRole("switch", { name: /password protection/i })
        fireEvent.click(toggle)

        const passwordInput = await screen.findByLabelText(/^Password$/)
        const confirmInput = screen.getByLabelText(/Confirm password/)
        fireEvent.change(passwordInput, { target: { value: "supersecret" } })
        fireEvent.change(confirmInput, { target: { value: "supersecret" } })

        fireEvent.click(screen.getByRole("button", { name: /^Set password$/ }))

        // Dialog should close after apply, and the toggle must remain ON.
        await waitFor(() => {
            expect(screen.queryByLabelText(/Confirm password/)).toBeNull()
        })
        expect((screen.getByRole("switch", { name: /password protection/i }) as HTMLInputElement).getAttribute("aria-checked")).toBe("true")

        fireEvent.click(screen.getByRole("button", { name: "Save changes" }))

        await waitFor(() => {
            expect(actionMocks.updateFormAction).toHaveBeenCalled()
        })

        const [, payload] = actionMocks.updateFormAction.mock.calls[0]!
        expect(payload.customKey).toBe(true)
        expect(typeof payload.salt).toBe("string")
        expect(typeof payload.customKeyData).toBe("string")
        expect(typeof payload.customKeyIv).toBe("string")
        expect(typeof payload.customKeyVerifier).toBe("string")
    })

    it("disables the password toggle and offers an upgrade for free-plan users", async () => {
        const { FormBuilderPage } = await import("@/components/form/dashboard/builder-page")

        render(
            <FormBuilderPage
                mode="edit"
                limits={{ removeBranding: false, customKey: false, maxSubmissionFileSize: 100_000_000 }}
                currentTier="free"
                initialForm={{
                    id: "abc123def456",
                    title: "Free-tier form",
                    description: null,
                    schema,
                    allowFileUploads: false,
                    maxSubmissions: null,
                    closesAt: null,
                    hideBranding: false,
                    submissionsCount: 0,
                    notifyOnSubmission: true,
                    customKey: false,
                    disabledByUser: false,
                }}
            />,
        )

        fireEvent.click(screen.getByRole("button", { name: /^Access/ }))

        const toggle = await screen.findByRole("switch", { name: /password protection/i })
        expect(toggle.getAttribute("data-disabled")).not.toBeNull()
        expect(screen.getByText(/Requires Plus/)).toBeTruthy()

        // Clicking the toggle is a no-op (disabled) — the dialog must not open.
        fireEvent.click(toggle)
        expect(screen.queryByLabelText(/Confirm password/)).toBeNull()

        // The "Upgrade to enable" button surfaces the upgrade dialog instead.
        fireEvent.click(screen.getByRole("button", { name: /Upgrade to enable/i }))
    })

    it("preserves existing password material when editing without a password change", async () => {
        const { buildFormInput } = await import("@/components/form/dashboard/builder-page")
        const result = buildFormInput({
            title: "Protected form",
            description: "",
            schema,
            hideBranding: false,
            maxSubmissions: "",
            closesAt: "",
            isEdit: true,
            passwordEnabled: true,
            passwordChanged: false,
        })

        expect("data" in result).toBe(true)
        if ("data" in result) {
            expect(result.data.customKey).toBeUndefined()
            expect(result.data.salt).toBeUndefined()
            expect(result.data.customKeyData).toBeUndefined()
            expect(result.data.customKeyIv).toBeUndefined()
            expect(result.data.customKeyVerifier).toBeUndefined()
        }
    })

    it("rejects duplicate field IDs before saving", async () => {
        const { buildFormInput } = await import("@/components/form/dashboard/builder-page")
        const result = buildFormInput({
            title: "Duplicate fields",
            description: "",
            schema: {
                version: 1,
                displayMode: "classic",
                submitButtonText: "Submit",
                fields: [
                    { id: "name", type: "short_text", label: "Name", required: false },
                    { id: "name", type: "short_text", label: "Other name", required: false },
                ],
            } as FormSchemaDoc,
            hideBranding: false,
            maxSubmissions: "",
            closesAt: "",
        })

        expect("error" in result).toBe(true)
        if ("error" in result) expect(result.error).toContain("field ids must be unique")
    })

    it("rejects invalid max submission values", async () => {
        const { buildFormInput } = await import("@/components/form/dashboard/builder-page")
        const result = buildFormInput({
            title: "Limited form",
            description: "",
            schema,
            hideBranding: false,
            maxSubmissions: "1.5",
            closesAt: "",
        })

        expect(result).toEqual({ error: "Max submissions must be a positive whole number" })
    })
})
