/**
 * @vitest-environment jsdom
 */
import * as React from "react"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    accountFindFirst: vi.fn(),
    auth: vi.fn(),
    broadcastVaultMessage: vi.fn(),
    getVaultStorageSupport: vi.fn(),
    getVaultSession: vi.fn(),
    signOutWithVaultCleanup: vi.fn(),
    persistTrustedBrowser: vi.fn(),
    push: vi.fn(),
    readVaultApiData: vi.fn(),
    redirect: vi.fn(),
    securityFindUnique: vi.fn(),
    setVaultRuntime: vi.fn(),
}))

vi.mock("next/navigation", () => ({
    redirect: (url: string) => mocks.redirect(url),
    useRouter: () => ({ push: mocks.push }),
}))

vi.mock("@/auth", () => ({
    auth: () => mocks.auth(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: {
        account: { findFirst: mocks.accountFindFirst },
        userSecurity: { findUnique: mocks.securityFindUnique },
    },
}))

vi.mock("@/lib/vault/client", () => {
    class VaultApiError extends Error {
        readonly code: string
        constructor(message: string, code: string) {
            super(message)
            this.code = code
        }
    }
    return {
        VaultApiError,
        persistTrustedBrowser: (...args: unknown[]) => mocks.persistTrustedBrowser(...args),
        readVaultApiData: (...args: unknown[]) => mocks.readVaultApiData(...args),
        signOutWithVaultCleanup: (...args: unknown[]) => mocks.signOutWithVaultCleanup(...args),
    }
})

vi.mock("@/lib/vault/server", () => ({
    getVaultSession: (...args: unknown[]) => mocks.getVaultSession(...args),
}))

vi.mock("@/lib/vault/crypto", () => ({
    arrayBufferToBase64Url: () => "encoded-value",
    deriveAuthSecret: vi.fn().mockResolvedValue(new Uint8Array(32)),
    derivePasswordKEK: vi.fn().mockResolvedValue({}),
    generateSalt: vi.fn(() => new Uint8Array(32)),
    generateVaultKey: vi.fn().mockResolvedValue({}),
    wrapVaultKey: vi.fn().mockResolvedValue(new Uint8Array(48)),
}))

vi.mock("@/lib/vault/runtime", () => ({
    setVaultRuntime: (...args: unknown[]) => mocks.setVaultRuntime(...args),
}))

vi.mock("@/lib/vault/storage-support", () => ({
    getVaultStorageSupport: () => mocks.getVaultStorageSupport(),
}))

vi.mock("@/lib/vault/sync", () => ({
    broadcastVaultMessage: (...args: unknown[]) => mocks.broadcastVaultMessage(...args),
}))

vi.mock("@/components/vault/trust-browser-toggle", () => ({
    TrustBrowserToggle: function TrustBrowserToggle() {
        return null
    },
}))

const storageSupport = {
    cryptoSubtle: true,
    indexedDb: true,
    localStorage: true,
    trustedBrowser: true,
    vault: true,
}

async function submitSetup(hasCredentialPassword: boolean) {
    const { SetupPasswordPageContent } = await import("@/app/(auth)/setup/setup-password-content")

    render(
        <SetupPasswordPageContent
            callbackUrl="/dashboard"
            hasCredentialPassword={hasCredentialPassword}
        />,
    )

    if (hasCredentialPassword) {
        fireEvent.change(screen.getByLabelText("Current password"), {
            target: { value: "legacy-1" },
        })
    }

    fireEvent.change(screen.getByLabelText("Vault password"), {
        target: { value: "new-vault-password" },
    })
    fireEvent.change(screen.getByLabelText("Confirm password"), {
        target: { value: "new-vault-password" },
    })
    fireEvent.click(screen.getByRole("button", { name: "Set vault password" }))

    await waitFor(() => expect(mocks.readVaultApiData).toHaveBeenCalledOnce())

    const [, init] = mocks.readVaultApiData.mock.calls[0] as [string, RequestInit]
    return JSON.parse(String(init.body)) as Record<string, unknown>
}

describe("vault password setup", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        mocks.auth.mockResolvedValue({
            user: { id: "user-123", twoFactorEnabled: false },
            twoFactorVerified: true,
        })
        mocks.securityFindUnique.mockResolvedValue(null)
        mocks.accountFindFirst.mockResolvedValue(null)
        mocks.getVaultStorageSupport.mockReturnValue(storageSupport)
        mocks.readVaultApiData.mockResolvedValue({
            vaultGeneration: 1,
            vaultId: "vault-123",
        })
        mocks.persistTrustedBrowser.mockResolvedValue(undefined)
        mocks.getVaultSession.mockResolvedValue({ session: { createdAt: new Date() } })
    })

    afterEach(() => {
        cleanup()
    })

    it("passes a non-sensitive credential-password signal from the setup page", async () => {
        mocks.accountFindFirst.mockResolvedValueOnce({ password: "stored-hash" })
        const { default: SetupPasswordPage } = await import("@/app/(auth)/setup/page")

        const withPassword = await SetupPasswordPage({
            searchParams: Promise.resolve({ callbackUrl: "/dashboard" }),
        }) as React.ReactElement<{ hasCredentialPassword: boolean }>

        mocks.accountFindFirst.mockResolvedValueOnce({ password: null })
        const withoutPassword = await SetupPasswordPage({
            searchParams: Promise.resolve({ callbackUrl: "/dashboard" }),
        }) as React.ReactElement<{ hasCredentialPassword: boolean }>

        expect(mocks.accountFindFirst).toHaveBeenCalledWith({
            where: {
                userId: "user-123",
                providerId: "credential",
            },
            select: { password: true },
        })
        expect(withPassword.props.hasCredentialPassword).toBe(true)
        expect(withoutPassword.props.hasCredentialPassword).toBe(false)
    })

    it("collects and submits the current password for an existing credential", async () => {
        const body = await submitSetup(true)

        expect(screen.getByLabelText("Current password").getAttribute("autocomplete"))
            .toBe("current-password")
        expect(body.currentPassword).toBe("legacy-1")
    })

    it("offers a way out to anyone who doesn't know the current password", async () => {
        await submitSetup(true)

        expect(screen.getByLabelText("Current password").getAttribute("aria-describedby"))
            .toBe("currentPasswordHint")
        expect(screen.getByRole("link", { name: "Forgot your password?" }).getAttribute("href"))
            .toBe("/reset")
    })

    it("preserves passwordless setup without requesting or submitting a current password", async () => {
        const body = await submitSetup(false)

        expect(screen.queryByLabelText("Current password")).toBeNull()
        expect(body).not.toHaveProperty("currentPassword")
    })

    it("flags a stale session from the setup page up front", async () => {
        const { default: SetupPasswordPage } = await import("@/app/(auth)/setup/page")

        const fresh = await SetupPasswordPage({
            searchParams: Promise.resolve({ callbackUrl: "/dashboard" }),
        }) as React.ReactElement<{ sessionFresh: boolean }>
        expect(fresh.props.sessionFresh).toBe(true)

        mocks.getVaultSession.mockResolvedValueOnce({
            session: { createdAt: new Date(Date.now() - 5 * 60 * 60 * 1000) },
        })
        const stale = await SetupPasswordPage({
            searchParams: Promise.resolve({ callbackUrl: "/dashboard" }),
        }) as React.ReactElement<{ sessionFresh: boolean }>
        expect(stale.props.sessionFresh).toBe(false)
    })

    it("offers sign-in-again instead of the form for a stale session", async () => {
        const { SetupPasswordPageContent } = await import("@/app/(auth)/setup/setup-password-content")
        render(
            <SetupPasswordPageContent callbackUrl="/dashboard" hasCredentialPassword={false} sessionFresh={false} />,
        )

        expect(screen.queryByLabelText("Vault password")).toBeNull()
        fireEvent.click(screen.getByRole("button", { name: "Sign in again" }))
        expect(mocks.signOutWithVaultCleanup).toHaveBeenCalledWith(
            "setup-password-reauth",
            `/login?callbackUrl=${encodeURIComponent("/setup?callbackUrl=%2Fdashboard")}`,
        )
    })

    it("switches to sign-in-again when the server reports SESSION_NOT_FRESH", async () => {
        const { VaultApiError } = await import("@/lib/vault/client")
        mocks.readVaultApiData.mockRejectedValueOnce(new VaultApiError("stale", "SESSION_NOT_FRESH"))

        await submitSetup(false)

        expect(await screen.findByRole("button", { name: "Sign in again" })).toBeTruthy()
        expect(mocks.push).not.toHaveBeenCalled()
    })

    it("treats a trusted-browser save failure after setup as success", async () => {
        mocks.persistTrustedBrowser.mockRejectedValueOnce(new Error("IndexedDB unavailable"))

        await submitSetup(false)

        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"))
        expect(mocks.setVaultRuntime).toHaveBeenCalled()
        expect(screen.queryByText("IndexedDB unavailable")).toBeNull()
    })

    it("treats an already-configured retry as done", async () => {
        const { VaultApiError } = await import("@/lib/vault/client")
        mocks.readVaultApiData.mockRejectedValueOnce(
            new VaultApiError("Vault security is already configured", "VAULT_ALREADY_CONFIGURED"),
        )

        await submitSetup(false)

        await waitFor(() => expect(mocks.push).toHaveBeenCalledWith("/dashboard"))
        expect(screen.queryByText("Vault security is already configured")).toBeNull()
    })
})
