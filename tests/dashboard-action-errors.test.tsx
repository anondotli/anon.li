/**
 * @vitest-environment jsdom
 *
 * Server actions can reject (network drop, deploy skew). Calls made inside a
 * transition must surface that as a toast instead of an unhandled rejection,
 * and rows rendering personal addresses must opt out of PostHog autocapture.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    toast: { success: vi.fn(), error: vi.fn() },
    toggleAliasAction: vi.fn(),
    resendVerificationAction: vi.fn(),
    addRecipientAction: vi.fn(),
}))

vi.mock("sonner", () => ({ toast: mocks.toast }))
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))
vi.mock("@/actions/alias", () => ({
    toggleAliasAction: mocks.toggleAliasAction,
    deleteAliasAction: vi.fn(),
    updateAliasAction: vi.fn(),
}))
vi.mock("@/actions/recipient", () => ({
    setDefaultRecipient: vi.fn(),
    resendVerificationAction: mocks.resendVerificationAction,
    deleteRecipientAction: vi.fn(),
    addRecipientAction: mocks.addRecipientAction,
}))
vi.mock("@/components/vault/vault-provider", () => ({
    useVault: () => ({ status: "unlocked", getVaultKey: () => ({}) }),
}))
vi.mock("@/components/recipients/recipient-pgp-dialog", () => ({ RecipientPgpDialog: () => null }))

import { AliasItem } from "@/components/alias/alias-item"
import { RecipientItem } from "@/components/recipients/recipient-item"
import { AddRecipientDialog } from "@/components/recipients/add-recipient-dialog"
import { DataExportSection } from "@/app/(dashboard)/dashboard/settings/data-export"

const alias = {
    id: "alias-1",
    email: "secret@anon.li",
    recipientId: "r1",
    recipient: { id: "r1", email: "me@example.com", pgpPublicKey: null },
    active: true,
    emailsReceived: 0,
    emailsBlocked: 0,
    createdAt: new Date(),
}
const metadata = { label: null, note: null, labelStatus: "empty" as const, noteStatus: "empty" as const }
const recipient = {
    id: "r2",
    email: "unverified@example.com",
    verified: false,
    isDefault: false,
    pgpPublicKey: null,
    pgpFingerprint: null,
    pgpKeyName: null,
    createdAt: new Date(),
    _count: { aliases: 0 },
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
})

describe("transition error handling", () => {
    it("toasts when toggling an alias throws", async () => {
        mocks.toggleAliasAction.mockRejectedValueOnce(new Error("network"))
        render(<AliasItem alias={alias} metadata={metadata} />)

        await act(async () => {
            fireEvent.click(screen.getAllByRole("switch", { name: "Pause alias" })[0]!)
        })

        expect(mocks.toast.error).toHaveBeenCalledWith("Failed to update alias. Please try again.")
    })

    it("toasts when resending a recipient verification throws", async () => {
        mocks.resendVerificationAction.mockRejectedValueOnce(new Error("network"))
        render(<RecipientItem recipient={recipient} />)

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /resend/i }))
        })

        expect(mocks.toast.error).toHaveBeenCalledWith("Failed to send verification email. Please try again.")
    })

    it("toasts when adding a recipient throws", async () => {
        mocks.addRecipientAction.mockRejectedValueOnce(new Error("network"))
        render(<AddRecipientDialog currentCount={0} maxCount={5} />)

        fireEvent.click(screen.getByRole("button", { name: /add recipient/i }))
        fireEvent.change(await screen.findByRole("textbox"), { target: { value: "new@example.com" } })
        await act(async () => {
            fireEvent.submit(screen.getByRole("textbox").closest("form")!)
        })

        expect(mocks.toast.error).toHaveBeenCalledWith("Failed to add recipient. Please try again.")
    })
})

describe("autocapture opt-out", () => {
    it("marks alias and recipient rows ph-no-capture", () => {
        const { container: aliasRow } = render(<AliasItem alias={alias} metadata={metadata} />)
        expect(aliasRow.querySelector(".ph-no-capture")?.textContent).toContain("secret@anon.li")
        cleanup()

        const { container: recipientRow } = render(<RecipientItem recipient={recipient} />)
        expect(recipientRow.querySelector(".ph-no-capture")?.textContent).toContain("unverified@example.com")
    })
})

describe("DataExportSection", () => {
    it("shows the route's { error } string on failure", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: "User not found" }), { status: 404 }),
        ))
        render(<DataExportSection />)

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /download/i }))
        })

        expect(mocks.toast.error).toHaveBeenCalledWith("User not found")
    })

    it("prefers the rate limiter's friendlier message", async () => {
        vi.stubGlobal("fetch", vi.fn().mockResolvedValue(
            new Response(JSON.stringify({ error: "Too many requests", message: "Rate limit exceeded. Please try again later." }), { status: 429 }),
        ))
        render(<DataExportSection />)

        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /download/i }))
        })

        expect(mocks.toast.error).toHaveBeenCalledWith("Rate limit exceeded. Please try again later.")
    })
})
