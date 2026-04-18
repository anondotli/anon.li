/**
 * @vitest-environment jsdom
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react"

import { FeaturePromptGrid } from "@/components/dashboard/feature-prompt-grid"
import { DASHBOARD_FEATURE_PROMPTS } from "@/config/features"

const ALIAS_STORAGE_KEY = "anon-li-alias-controls-dismissed-test"
const DROP_STORAGE_KEY = "anon-li-drop-controls-dismissed-test"

beforeEach(() => {
    localStorage.clear()
})

afterEach(() => {
    cleanup()
    localStorage.clear()
})

describe("FeaturePromptGrid", () => {
    it("can be dismissed when a storage key is provided", async () => {
        render(
            <FeaturePromptGrid
                title="Alias controls worth knowing"
                description="Controls that make aliases easier to manage."
                featureIds={DASHBOARD_FEATURE_PROMPTS.alias}
                dismissStorageKey={ALIAS_STORAGE_KEY}
            />
        )

        await waitFor(() => {
            expect(screen.getByText("Alias controls worth knowing")).toBeTruthy()
        })

        fireEvent.click(screen.getByRole("button", { name: "Dismiss Alias controls worth knowing" }))

        await waitFor(() => {
            expect(screen.queryByText("Alias controls worth knowing")).toBeNull()
        })
        expect(localStorage.getItem(ALIAS_STORAGE_KEY)).toBe("true")
    })

    it("can dismiss the Drop controls prompt independently", async () => {
        render(
            <FeaturePromptGrid
                title="Drop controls worth knowing"
                description="Controls that make drops easier to manage."
                featureIds={DASHBOARD_FEATURE_PROMPTS.drop}
                dismissStorageKey={DROP_STORAGE_KEY}
            />
        )

        await waitFor(() => {
            expect(screen.getByText("Drop controls worth knowing")).toBeTruthy()
        })

        fireEvent.click(screen.getByRole("button", { name: "Dismiss Drop controls worth knowing" }))

        await waitFor(() => {
            expect(screen.queryByText("Drop controls worth knowing")).toBeNull()
        })
        expect(localStorage.getItem(DROP_STORAGE_KEY)).toBe("true")
    })
})
