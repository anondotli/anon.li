/**
 * @vitest-environment node
 *
 * Org-scoped audit trail: audit() tags org events with organizationId (and never
 * throws), and getOrgAuditLogs reads a single org's events newest-first with a
 * clamped limit.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma } = vi.hoisted(() => ({
    prisma: { auditLog: { create: vi.fn(), findMany: vi.fn() } },
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

import { audit } from "@/lib/services/audit"
import { getOrgAuditLogs } from "@/lib/data/audit"

beforeEach(() => {
    vi.clearAllMocks()
})

describe("audit() — org events", () => {
    it("records organizationId for org-scoped actions", async () => {
        prisma.auditLog.create.mockResolvedValue({})
        await audit({
            action: "org.vault.grant",
            actorId: "u1",
            targetId: "u2",
            organizationId: "org-9",
            metadata: { orgKeyGeneration: 2 },
        })
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: {
                action: "org.vault.grant",
                actorId: "u1",
                targetId: "u2",
                organizationId: "org-9",
                metadata: JSON.stringify({ orgKeyGeneration: 2 }),
                ip: null,
            },
        })
    })

    it("defaults organizationId to null for platform actions", async () => {
        prisma.auditLog.create.mockResolvedValue({})
        await audit({ action: "user.ban", actorId: "admin-1" })
        expect(prisma.auditLog.create).toHaveBeenCalledWith({
            data: { action: "user.ban", actorId: "admin-1", targetId: null, organizationId: null, metadata: null, ip: null },
        })
    })

    it("never throws — swallows write failures", async () => {
        prisma.auditLog.create.mockRejectedValue(new Error("db down"))
        await expect(
            audit({ action: "org.member.add", actorId: "u1", organizationId: "org-9" }),
        ).resolves.toBeUndefined()
    })
})

describe("getOrgAuditLogs", () => {
    it("queries the org's events newest-first and clamps the limit", async () => {
        prisma.auditLog.findMany.mockResolvedValue([])
        await getOrgAuditLogs("org-9", { limit: 9999, action: "org.vault.grant" })
        expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { organizationId: "org-9", action: "org.vault.grant" },
                orderBy: { createdAt: "desc" },
                take: 500,
            }),
        )
    })

    it("omits the action filter and defaults the limit when not provided", async () => {
        prisma.auditLog.findMany.mockResolvedValue([])
        await getOrgAuditLogs("org-9")
        expect(prisma.auditLog.findMany).toHaveBeenCalledWith(
            expect.objectContaining({ where: { organizationId: "org-9" }, take: 100 }),
        )
    })
})
