/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it, vi } from "vitest"
import { cleanup, fireEvent, render, screen } from "@testing-library/react"
import { DropSettings, type DropConfig } from "@/components/drop/upload/drop-settings"

const config: DropConfig = {
    title: "",
    message: "",
    protectionMode: "key",
    password: "",
    expiryDays: 3,
    maxDownloads: "",
    hideBranding: false,
    notifyOnDownload: false,
}

afterEach(() => cleanup())

describe("DropSettings", () => {
    it("collects an encrypted recipient message", () => {
        const onUpdate = vi.fn()
        render(
            <DropSettings
                config={config}
                onUpdate={onUpdate}
                showTitleInput={false}
                maxExpiry={3}
                features={{ noBranding: false, downloadNotifications: false, customKey: false }}
            />,
        )

        fireEvent.change(screen.getByLabelText(/message/i), {
            target: { value: "Here are the final project files." },
        })

        expect(onUpdate).toHaveBeenCalledWith({
            message: "Here are the final project files.",
        })
        expect(screen.getByText(/encrypted with your files/i)).toBeTruthy()
    })

    it("summarizes access policy before upload and exposes advanced state", () => {
        render(
            <DropSettings
                config={config}
                onUpdate={vi.fn()}
                showTitleInput={false}
                maxExpiry={3}
                features={{ noBranding: false, downloadNotifications: false, customKey: false }}
            />,
        )

        expect(screen.getByText(/key included in link · deletes after 3 days · no download limit/i)).toBeTruthy()

        const optionsButton = screen.getByRole("button", { name: /show options/i })
        expect(optionsButton.getAttribute("aria-expanded")).toBe("false")
        fireEvent.click(optionsButton)
        expect(optionsButton.getAttribute("aria-expanded")).toBe("true")
        expect(screen.getByLabelText(/max downloads/i)).toBeTruthy()
    })
})
