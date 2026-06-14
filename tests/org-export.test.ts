/**
 * @vitest-environment node
 *
 * Org data export must scope EVERY query to the organizationId (the tenant
 * boundary) and shape the result for a portable JSON download.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma } = vi.hoisted(() => ({
    prisma: {
        organization: { findUnique: vi.fn() },
        member: { findMany: vi.fn() },
        alias: { findMany: vi.fn() },
        domain: { findMany: vi.fn() },
        recipient: { findMany: vi.fn() },
        form: { findMany: vi.fn() },
        subscription: { findMany: vi.fn() },
        auditLog: { findMany: vi.fn() },
    },
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma }))

import { buildOrgDataExport } from "@/lib/data/org-export"

beforeEach(() => {
    vi.clearAllMocks()
    prisma.organization.findUnique.mockResolvedValue({
        name: "Acme",
        slug: "acme",
        createdAt: new Date(),
        enforce2FA: false,
    })
    prisma.member.findMany.mockResolvedValue([
        { role: "owner", createdAt: new Date(), user: { email: "a@acme.com", name: "A" } },
    ])
    prisma.alias.findMany.mockResolvedValue([{ email: "x@acme.com" }])
    prisma.domain.findMany.mockResolvedValue([])
    prisma.recipient.findMany.mockResolvedValue([])
    prisma.form.findMany.mockResolvedValue([])
    prisma.subscription.findMany.mockResolvedValue([])
    prisma.auditLog.findMany.mockResolvedValue([])
})

describe("buildOrgDataExport", () => {
    it("scopes EVERY query to the organizationId", async () => {
        await buildOrgDataExport("org-9")

        expect(prisma.organization.findUnique).toHaveBeenCalledWith(
            expect.objectContaining({ where: { id: "org-9" } }),
        )
        for (const model of [prisma.member, prisma.alias, prisma.domain, prisma.recipient, prisma.form]) {
            expect(model.findMany).toHaveBeenCalledWith(
                expect.objectContaining({ where: { organizationId: "org-9" } }),
            )
        }
        expect(prisma.subscription.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: "org-9", status: { in: ["active", "trialing"] } } }),
        )
        expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: "org-9" }, orderBy: { createdAt: "desc" }, take: 500 }),
        )
    })

    it("flattens member user info and includes the top-level sections", async () => {
        const result = await buildOrgDataExport("org-9")

        expect(result.organization).toMatchObject({ name: "Acme", slug: "acme" })
        expect(result.members).toEqual([
            { email: "a@acme.com", name: "A", role: "owner", joinedAt: expect.any(Date) },
        ])
        expect(result).toHaveProperty("aliases")
        expect(result).toHaveProperty("auditLog")
        expect(typeof result.exportedAt).toBe("string")
    })
})
