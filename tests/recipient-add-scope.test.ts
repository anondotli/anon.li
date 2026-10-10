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
import { ConflictError, UpgradeRequiredError } from "@/lib/api-error-utils"

const { recipientDeleteMany } = vi.hoisted(() => ({ recipientDeleteMany: vi.fn() }))

const txRecipient = {
    findFirst: vi.fn(),
    count: vi.fn(),
    create: vi.fn(),
}

vi.mock("@/lib/prisma", () => ({
    prisma: {
        domain: { findFirst: vi.fn().mockResolvedValue(null) },
        recipient: { deleteMany: recipientDeleteMany },
        // $transaction(callback, opts) — invoke the callback with our fake tx.
        $transaction: vi.fn((cb: (tx: unknown) => unknown) => cb({ recipient: txRecipient })),
    },
}))

vi.mock("@/lib/data/user", () => ({
    getUserById: vi.fn().mockResolvedValue({ id: "user-1", email: "me@example.com" }),
}))

vi.mock("@/lib/limits", () => ({
    getRecipientLimit: vi.fn().mockReturnValue(100),
    getEffectiveTier: vi.fn().mockReturnValue("free"),
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
        storageUsed: BigInt(0),
    }),
}))

const sendRecipientVerificationEmail = vi.fn().mockResolvedValue({ success: true })
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
        sendRecipientVerificationEmail.mockResolvedValue({ success: true })
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
        vi.mocked(getOrgLimitContext).mockResolvedValueOnce({
            subscriptions: [],
            referralPlusUntil: null,
            storageUsed: BigInt(0),
        })

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

    it("reports the plan's recipient limit as UPGRADE_REQUIRED (402), not a validation error", async () => {
        txRecipient.count.mockResolvedValueOnce(100)
        const { RecipientService } = await import("@/lib/services/recipient")

        const error = await RecipientService.addRecipient(personalScope("user-1"), "over@example.com")
            .catch((e: unknown) => e)
        expect(error).toBeInstanceOf(UpgradeRequiredError)
        expect((error as UpgradeRequiredError).statusCode).toBe(402)
        expect((error as UpgradeRequiredError).details).toEqual({
            scope: "alias_recipients",
            currentTier: "free",
            suggestedTier: "plus",
            currentValue: 100,
            limitValue: 100,
        })
        expect(txRecipient.create).not.toHaveBeenCalled()
        expect(sendRecipientVerificationEmail).not.toHaveBeenCalled()
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

    it("rolls back the recipient when the verification email reports failure", async () => {
        sendRecipientVerificationEmail.mockResolvedValueOnce({ success: false, error: new Error("resend") })
        const { RecipientService } = await import("@/lib/services/recipient")

        await expect(
            RecipientService.addRecipient(personalScope("user-1"), "friend@example.com"),
        ).rejects.toThrow("Failed to send verification email")
        expect(recipientDeleteMany).toHaveBeenCalledWith({
            where: { id: "rec-1", userId: "user-1", organizationId: null },
        })
    })
})

describe("RecipientService.resendVerification", () => {
    it("reports failure when the verification email is not delivered", async () => {
        const data = await import("@/lib/data/recipient")
        vi.spyOn(data, "getRecipientById").mockResolvedValue({
            id: "rec-1",
            email: "friend@example.com",
            verified: false,
        } as Awaited<ReturnType<typeof data.getRecipientById>>)
        vi.spyOn(data, "updateRecipient").mockResolvedValue({} as Awaited<ReturnType<typeof data.updateRecipient>>)
        sendRecipientVerificationEmail.mockResolvedValueOnce({ success: false, error: new Error("resend") })
        const { RecipientService } = await import("@/lib/services/recipient")

        await expect(
            RecipientService.resendVerification(personalScope("user-1"), "rec-1"),
        ).rejects.toThrow("Failed to send verification email")
    })
})
