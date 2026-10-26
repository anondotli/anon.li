/**
 * @vitest-environment jsdom
 *
 * Changing the password needs a fresh session. The UI must offer a re-sign-in
 * both up front (local hint) and when the server answers SESSION_NOT_FRESH,
 * instead of a dead-end error after the user has filled in everything.
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    useSession: vi.fn(),
    readVaultApiData: vi.fn(),
    signOutWithVaultCleanup: vi.fn(),
    toastError: vi.fn(),
    unwrapVaultKey: vi.fn(),
}))

vi.mock("@/lib/auth-client", () => ({ authClient: { useSession: mocks.useSession } }))
vi.mock("@/components/vault/vault-provider", () => ({
    useVault: () => ({ getVaultKey: () => ({}) as CryptoKey, unlockWithPassword: vi.fn() }),
}))
vi.mock("@/lib/vault/client", () => {
    class VaultApiError extends Error {
        constructor(message: string, readonly code: string) {
            super(message)
        }
    }
    return {
        readVaultApiData: mocks.readVaultApiData,
        signOutWithVaultCleanup: mocks.signOutWithVaultCleanup,
        VaultApiError,
    }
})
vi.mock("@/lib/vault/trusted-browser", () => ({ clearTrustedBrowserState: vi.fn() }))
vi.mock("@/lib/vault/sync", () => ({ broadcastVaultMessage: vi.fn() }))
vi.mock("@/lib/vault/crypto", () => ({
    base64UrlToArrayBuffer: () => new ArrayBuffer(8),
    arrayBufferToBase64Url: () => "x".repeat(43),
    deriveAuthSecret: async () => new ArrayBuffer(32),
    derivePasswordKEK: async () => ({}),
    generateSalt: () => new Uint8Array(32),
    unwrapVaultKey: mocks.unwrapVaultKey,
    wrapVaultKey: async () => new ArrayBuffer(40),
}))
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn(), warning: vi.fn() } }))

import { PasswordSettings } from "@/components/vault/password-settings"
import { VaultApiError } from "@/lib/vault/client"
import { SESSION_NOT_FRESH_ERROR_CODE } from "@/lib/vault/session-freshness"
import { ErrorCodes } from "@/lib/api-response"

function sessionCreatedAgo(ms: number) {
    return { data: { user: { email: "u@example.com" }, session: { createdAt: new Date(Date.now() - ms) } } }
}

async function submitCurrentPassword() {
    fireEvent.change(screen.getByLabelText("Current password"), { target: { value: "old-password" } })
    await act(async () => {
        fireEvent.click(screen.getByRole("button", { name: /next/i }))
    })
}

describe("PasswordSettings re-authentication", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.unwrapVaultKey.mockResolvedValue({})
    })
    afterEach(() => cleanup())

    it("client and server agree on the SESSION_NOT_FRESH code", () => {
        expect(SESSION_NOT_FRESH_ERROR_CODE).toBe(ErrorCodes.SESSION_NOT_FRESH)
    })

    it("asks to sign in again up front when the session is already stale", async () => {
        mocks.useSession.mockReturnValue(sessionCreatedAgo(5 * 60 * 60 * 1000))
        render(<PasswordSettings />)

        await submitCurrentPassword()

        expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy()
        expect(mocks.readVaultApiData).not.toHaveBeenCalled()
    })

    it("asks to sign in again when the server answers SESSION_NOT_FRESH", async () => {
        mocks.useSession.mockReturnValue(sessionCreatedAgo(60 * 1000))
        mocks.readVaultApiData.mockImplementation(async (input: string) => {
            if (input === "/api/vault/unlock") return { vaultSalt: "s", passwordWrappedVaultKey: "w" }
            if (input === "/api/vault/bootstrap") return { authSalt: "a" }
            throw new VaultApiError("Please sign in again", "SESSION_NOT_FRESH")
        })
        render(<PasswordSettings />)

        await submitCurrentPassword()
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-new-password-123" } })
        fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-new-password-123" } })
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /change password/i }))
        })

        expect(screen.getByRole("button", { name: "Sign in again" })).toBeTruthy()
        expect(mocks.toastError).not.toHaveBeenCalled()

        fireEvent.click(screen.getByRole("button", { name: "Sign in again" }))
        expect(mocks.signOutWithVaultCleanup).toHaveBeenCalledWith(
            "password-settings-reauth",
            `/login?callbackUrl=${encodeURIComponent("/dashboard/settings")}`,
        )
    })

    it("shows other server errors as a normal error", async () => {
        mocks.useSession.mockReturnValue(sessionCreatedAgo(60 * 1000))
        mocks.readVaultApiData.mockImplementation(async (input: string) => {
            if (input === "/api/vault/unlock") return { vaultSalt: "s", passwordWrappedVaultKey: "w" }
            if (input === "/api/vault/bootstrap") return { authSalt: "a" }
            throw new VaultApiError("Incorrect password", "UNAUTHORIZED")
        })
        render(<PasswordSettings />)

        await submitCurrentPassword()
        fireEvent.change(screen.getByLabelText("New password"), { target: { value: "a-new-password-123" } })
        fireEvent.change(screen.getByLabelText("Confirm new password"), { target: { value: "a-new-password-123" } })
        await act(async () => {
            fireEvent.click(screen.getByRole("button", { name: /change password/i }))
        })

        expect(mocks.toastError).toHaveBeenCalledWith("Incorrect password")
        expect(screen.queryByRole("button", { name: "Sign in again" })).toBeNull()
    })

    it("reports a wrong current password when the vault key does not unwrap", async () => {
        mocks.useSession.mockReturnValue(sessionCreatedAgo(60 * 1000))
        mocks.readVaultApiData.mockResolvedValue({ vaultSalt: "s", passwordWrappedVaultKey: "w" })
        mocks.unwrapVaultKey.mockRejectedValue(new Error("OperationError"))
        render(<PasswordSettings />)

        await submitCurrentPassword()

        expect(mocks.toastError).toHaveBeenCalledWith("Current password is incorrect")
        expect(screen.queryByLabelText("New password")).toBeNull()
    })

    it("does not blame the password when loading the vault materials fails", async () => {
        mocks.useSession.mockReturnValue(sessionCreatedAgo(60 * 1000))
        mocks.readVaultApiData.mockRejectedValue(
            new VaultApiError("Too many attempts. Please try again in 3 minutes.", "RATE_LIMITED"),
        )
        render(<PasswordSettings />)

        await submitCurrentPassword()

        expect(mocks.toastError).toHaveBeenCalledWith("Too many attempts. Please try again in 3 minutes.")
        expect(mocks.unwrapVaultKey).not.toHaveBeenCalled()
        expect(screen.queryByLabelText("New password")).toBeNull()
    })
})
