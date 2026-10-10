/**
 * @vitest-environment jsdom
 *
 * Autocapture must not lift on-screen PII (alias/recipient addresses live in
 * element text and aria-labels), and sign-out must drop the identified
 * PostHog profile because it navigates with a full page load.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

const mocks = vi.hoisted(() => ({
    init: vi.fn(),
    reset: vi.fn(),
    clearTrustedBrowserState: vi.fn(),
    broadcastVaultMessage: vi.fn(),
}))

vi.mock("posthog-js", () => ({ default: { init: mocks.init, reset: mocks.reset } }))
vi.mock("@/lib/auth-client", () => ({ authClient: { signOut: vi.fn() } }))
vi.mock("@/lib/vault/trusted-browser", () => ({
    clearTrustedBrowserState: mocks.clearTrustedBrowserState,
    getDeviceKey: vi.fn(),
    readCapsule: vi.fn(),
    storeCapsule: vi.fn(),
    storeDeviceKey: vi.fn(),
}))
vi.mock("@/lib/vault/sync", () => ({ broadcastVaultMessage: mocks.broadcastVaultMessage }))

describe("PostHog privacy", () => {
    beforeEach(() => {
        vi.resetModules()
        vi.clearAllMocks()
        mocks.clearTrustedBrowserState.mockResolvedValue(undefined)
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test")
    })

    afterEach(() => {
        vi.unstubAllEnvs()
    })

    it("masks autocaptured element text and attributes", async () => {
        await import("@/instrumentation-client")

        expect(mocks.init).toHaveBeenCalledOnce()
        const [, options] = mocks.init.mock.calls[0] as [string, Record<string, unknown>]
        expect(options).toMatchObject({
            mask_all_text: true,
            mask_all_element_attributes: true,
            disable_session_recording: true,
        })
    })

    it("resets the PostHog identity on sign-out cleanup", async () => {
        const { clearVaultForSignOut } = await import("@/lib/vault/client")

        await clearVaultForSignOut("test")

        expect(mocks.reset).toHaveBeenCalledOnce()
        expect(mocks.broadcastVaultMessage).toHaveBeenCalled()
    })

    it("never lets a PostHog failure block sign-out", async () => {
        mocks.reset.mockImplementationOnce(() => { throw new Error("not initialized") })
        const { clearVaultForSignOut } = await import("@/lib/vault/client")

        await expect(clearVaultForSignOut("test")).resolves.toBeUndefined()
    })

    it("does not touch PostHog when analytics is disabled", async () => {
        vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "")
        const { clearVaultForSignOut } = await import("@/lib/vault/client")

        await clearVaultForSignOut("test")

        expect(mocks.reset).not.toHaveBeenCalled()
    })
})
