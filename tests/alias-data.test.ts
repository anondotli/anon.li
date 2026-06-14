/**
 * @vitest-environment node
 *
 * Pagination + aggregate-count helpers behind the alias listing (H3): the v1 API
 * and dashboard must not load every alias row for users with unlimited aliases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest"

const { aliasFindMany, aliasGroupBy } = vi.hoisted(() => ({
    aliasFindMany: vi.fn(),
    aliasGroupBy: vi.fn(),
}))

vi.mock("@/lib/prisma", () => ({
    prisma: { alias: { findMany: aliasFindMany, groupBy: aliasGroupBy } },
}))

import { getAliases, countAliasesByFormat } from "@/lib/data/alias"
import { personalScope } from "@/lib/ownership"

const scope = personalScope("user-1")

describe("getAliases pagination", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        aliasFindMany.mockResolvedValue([])
    })

    it("passes take/skip when limit and offset are provided", async () => {
        await getAliases(scope, { limit: 25, offset: 50 })
        expect(aliasFindMany).toHaveBeenCalledWith(
            expect.objectContaining({ take: 25, skip: 50 })
        )
    })

    it("omits take/skip when no pagination options are given", async () => {
        await getAliases(scope)
        const arg = aliasFindMany.mock.calls[0]?.[0] as Record<string, unknown>
        expect(arg).not.toHaveProperty("take")
        expect(arg).not.toHaveProperty("skip")
    })
})

describe("countAliasesByFormat", () => {
    beforeEach(() => vi.clearAllMocks())

    it("maps grouped rows to random/custom/total", async () => {
        aliasGroupBy.mockResolvedValue([
            { format: "RANDOM", _count: { _all: 7 } },
            { format: "CUSTOM", _count: { _all: 3 } },
        ])
        await expect(countAliasesByFormat(scope)).resolves.toEqual({ random: 7, custom: 3, total: 10 })
    })

    it("treats missing formats as zero", async () => {
        aliasGroupBy.mockResolvedValue([{ format: "RANDOM", _count: { _all: 4 } }])
        await expect(countAliasesByFormat(scope)).resolves.toEqual({ random: 4, custom: 0, total: 4 })
    })
})
