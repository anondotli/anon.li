/**
 * @vitest-environment node
 *
 * Org member-lifecycle audit emitters (wired into better-auth organizationHooks)
 * write the expected audit rows. Guards against the previously-orphaned
 * org.member.* / org.invitation.send action types shipping unemitted.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const { prisma } = vi.hoisted(() => ({
    prisma: { auditLog: { create: vi.fn() } },
}))

vi.mock("server-only", () => ({}))
vi.mock("@/lib/prisma", () => ({ prisma }))
vi.mock("@/lib/logger", () => ({
    createLogger: () => ({ error: vi.fn(), info: vi.fn(), warn: vi.fn(), debug: vi.fn() }),
}))

import {
    recordInvitationSent,
    recordMemberAdded,
    recordMemberRemoved,
    recordMemberRoleChanged,
} from "@/lib/services/audit"

beforeEach(() => {
    vi.clearAllMocks()
    prisma.auditLog.create.mockResolvedValue({})
})

const dataOf = () => prisma.auditLog.create.mock.calls[0]![0].data

describe("org member-lifecycle audit emitters", () => {
    it("records org.member.add with the acting admin as actor and member as target", async () => {
        recordMemberAdded({ actorId: "admin-1", targetUserId: "u1", organizationId: "org-9", role: "member" })
        await vi.waitFor(() => expect(prisma.auditLog.create).toHaveBeenCalled())
        expect(dataOf()).toMatchObject({
            action: "org.member.add",
            actorId: "admin-1",
            targetId: "u1",
            organizationId: "org-9",
            metadata: JSON.stringify({ role: "member" }),
        })
    })

    it("records org.member.remove with distinct actor and target", async () => {
        recordMemberRemoved({ actorId: "admin-1", targetUserId: "u2", organizationId: "org-9", role: "admin" })
        await vi.waitFor(() => expect(prisma.auditLog.create).toHaveBeenCalled())
        expect(dataOf()).toMatchObject({ action: "org.member.remove", actorId: "admin-1", targetId: "u2", organizationId: "org-9" })
    })

    it("records org.member.role_change with from/to roles", async () => {
        recordMemberRoleChanged({ actorId: "admin-1", targetUserId: "u3", organizationId: "org-9", from: "member", to: "admin" })
        await vi.waitFor(() => expect(prisma.auditLog.create).toHaveBeenCalled())
        expect(dataOf()).toMatchObject({
            action: "org.member.role_change",
            actorId: "admin-1",
            targetId: "u3",
            organizationId: "org-9",
            metadata: JSON.stringify({ from: "member", to: "admin" }),
        })
    })

    it("records org.invitation.send with the real inviter as actor", async () => {
        recordInvitationSent({ inviterId: "admin-1", organizationId: "org-9", email: "new@x.com", role: "member" })
        await vi.waitFor(() => expect(prisma.auditLog.create).toHaveBeenCalled())
        expect(dataOf()).toMatchObject({
            action: "org.invitation.send",
            actorId: "admin-1",
            organizationId: "org-9",
            metadata: JSON.stringify({ email: "new@x.com", role: "member" }),
        })
    })
})
