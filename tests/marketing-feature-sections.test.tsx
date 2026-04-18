/**
 * @vitest-environment jsdom
 */
import { afterEach, describe, expect, it } from "vitest"
import { cleanup, render, screen } from "@testing-library/react"

import { FeaturesSection } from "@/components/marketing/features-section"
import { ProductsSection } from "@/components/marketing/products-section"

afterEach(() => {
    cleanup()
})

describe("marketing feature sections", () => {
    it("presents core products before tertiary tools", () => {
        render(<ProductsSection />)

        expect(screen.getByText("anon.li Alias")).toBeTruthy()
        expect(screen.getByText("anon.li Drop")).toBeTruthy()
        expect(screen.getByText("Random & Custom Aliases")).toBeTruthy()
        expect(screen.getByText("Vault Key Recovery")).toBeTruthy()
        expect(screen.getByText("REST API")).toBeTruthy()
        expect(screen.getByText("MCP Server")).toBeTruthy()
    })

    it("shows primary features, advanced controls, and lower-priority tools", () => {
        render(<FeaturesSection />)

        expect(screen.getByText("What anon.li protects")).toBeTruthy()
        expect(screen.getByText("Private Email Aliases")).toBeTruthy()
        expect(screen.getByText("Zero-Knowledge Share Links")).toBeTruthy()
        expect(screen.getByText("Advanced controls")).toBeTruthy()
        expect(screen.getByText("Power tools")).toBeTruthy()
        expect(screen.getByText("MCP")).toBeTruthy()
        expect(screen.queryByText(/keep files forever/i)).toBeNull()
    })
})
