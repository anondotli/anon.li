import { describe, expect, it } from "vitest"

import { comparisons } from "@/config/comparisons"

describe("comparisons config", () => {
    it("publishes exactly 20 competitor-intent pages", () => {
        expect(comparisons).toHaveLength(20)
    })

    it("uses unique ids and slugs", () => {
        const ids = comparisons.map((entry) => entry.id)
        const slugs = comparisons.map((entry) => entry.slug)

        expect(new Set(ids).size).toBe(ids.length)
        expect(new Set(slugs).size).toBe(slugs.length)
    })

    it("keeps lastVerified values in ISO date format", () => {
        for (const entry of comparisons) {
            expect(entry.lastVerified).toMatch(/^\d{4}-\d{2}-\d{2}$/)
            expect(Number.isNaN(Date.parse(entry.lastVerified))).toBe(false)
        }
    })

    it("provides source metadata consistently for feature claims", () => {
        for (const entry of comparisons) {
            expect(entry.sourceUrl).toMatch(/^https?:\/\//)
            expect(entry.sourceName.length).toBeGreaterThan(0)

            const sources = new Set<string>([entry.sourceUrl])

            for (const section of entry.comparisonData.features) {
                expect(section.category.length).toBeGreaterThan(0)
                expect(section.items.length).toBeGreaterThan(0)

                for (const item of section.items) {
                    const hasSource = Boolean(item.source)
                    const hasLabel = Boolean(item.sourceLabel)
                    expect(hasSource).toBe(hasLabel)

                    if (item.source) {
                        sources.add(item.source)
                    }
                }
            }

            expect(sources.size).toBeGreaterThanOrEqual(2)
        }
    })

    it("keeps comparison recommendation lists populated", () => {
        for (const entry of comparisons) {
            expect(entry.anonliPros.length).toBeGreaterThan(0)
            expect(entry.competitorPros.length).toBeGreaterThan(0)
            expect(entry.whoShouldUseData.anonLi.length).toBeGreaterThan(0)
            expect(entry.whoShouldUseData.competitor.length).toBeGreaterThan(0)
        }
    })
})
