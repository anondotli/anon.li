/**
 * @vitest-environment node
 *
 * Covers the scope-aware uniqueness fix: a user can forward to the same email
 * both personally and within an org, and a constraint race surfaces as a clean
 * ConflictError rather than an unhandled Prisma P2002.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"
import { Prisma } from "@prisma/client"
import { orgScope, personalScope } from "@/lib/ownership"
import { ConflictError } from "@/lib/api-error-utils"

const txRecipient = {
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
}

vi.mock("@/lib/prisma", () => ({
    prisma: {
        domain: { findFirst: vi.fn().mockResolvedValue(null) },
        // $transaction(callback, opts) — invoke the callback with our fake tx.
        $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ recipient: txRecipient })),
    },
}))

vi.mock("@/lib/data/user", () => ({
    getUserById: vi.fn().mockResolvedValue({ id: "user-1", email: "me@example.com" }),
}))

vi.mock("@/lib/limits", () => ({
    getRecipientLimit: vi.fn().mockReturnValue(100),
    // Faithful stand-in for the purchase-first gate: throws when the org has no
    // active plan. This test exercises a SUBSCRIBED org (below), so it passes.
    assertOrgPlanActive: (ctx: { subscriptions: unknown[] }) => {
        if (ctx.subscriptions.length === 0) throw new Error("Team needs a Business subscription")
    },
}))

// Org-scope limits derive from the org's own plan; stub the context fetch so the
// org path doesn't reach prisma.subscription. A Business sub means the team
// workspace is unlocked (purchase-first Teams).
vi.mock("@/lib/data/auth", () => ({
    getOrgLimitContext: vi.fn().mockResolvedValue({
        subscriptions: [{ status: "active", product: "business", tier: "pro", currentPeriodEnd: null }],
        referralPlusUntil: null,
    }),
}))

const sendRecipientVerificationEmail = vi.fn().mockResolvedValue(undefined)
vi.mock("@/lib/resend", () => ({
    sendRecipientVerificationEmail: (...args: unknown[]) => sendRecipientVerificationEmail(...args),
}))

describe("RecipientService.addRecipient — scope-aware uniqueness", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        txRecipient.findFirst.mockResolvedValue(null) // no in-scope dupe
        txRecipient.count.mockResolvedValue(0)
        txRecipient.create.mockImplementation(({ data }: { data: Record<string, unknown> }) => ({
            id: "rec-1",
            ...data,
        }))
        sendRecipientVerificationEmail.mockResolvedValue(undefined)
    })

    it("creates an org-scoped recipient even when the same email exists personally", async () => {
        const { RecipientService } = await import("@/lib/services/recipient")

        // The existence check is scoped: in org scope it only sees org rows, so a
        // personal recipient with the same email does not block creation.
        const recipient = await RecipientService.addRecipient(
            orgScope("user-1", "org-1", "owner"),
            "Me@Example.com",
        )

        expect(txRecipient.findFirst).toHaveBeenCalledWith({
            where: { organizationId: "org-1", email: "me@example.com" },
        })
        expect(txRecipient.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    userId: "user-1",
                    organizationId: "org-1",
                    email: "me@example.com",
                }),
            }),
        )
        expect(recipient.organizationId).toBe("org-1")
        expect(sendRecipientVerificationEmail).toHaveBeenCalledWith("me@example.com", expect.any(String))
    })

    it("rejects org-scope creation when the team has no active subscription", async () => {
        const { getOrgLimitContext } = await import("@/lib/data/auth")
        vi.mocked(getOrgLimitContext).mockResolvedValueOnce({ subscriptions: [], referralPlusUntil: null })

        const { RecipientService } = await import("@/lib/services/recipient")

        await expect(
            RecipientService.addRecipient(orgScope("user-1", "org-1", "owner"), "nope@example.com"),
        ).rejects.toThrow()
        // The gate fires before the create transaction.
        expect(txRecipient.create).not.toHaveBeenCalled()
    })

    it("creates a personal recipient with a null organizationId", async () => {
        const { RecipientService } = await import("@/lib/services/recipient")

        const recipient = await RecipientService.addRecipient(personalScope("user-1"), "friend@example.com")

        expect(txRecipient.findFirst).toHaveBeenCalledWith({
            where: { userId: "user-1", organizationId: null, email: "friend@example.com" },
        })
        expect(recipient.organizationId).toBeNull()
    })

    it("translates a P2002 constraint race into a ConflictError", async () => {
        txRecipient.create.mockRejectedValueOnce(
            new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
                code: "P2002",
                clientVersion: "test",
            }),
        )
        const { RecipientService } = await import("@/lib/services/recipient")

        await expect(
            RecipientService.addRecipient(orgScope("user-1", "org-1", "owner"), "race@example.com"),
        ).rejects.toBeInstanceOf(ConflictError)
        expect(sendRecipientVerificationEmail).not.toHaveBeenCalled()
    })
})
