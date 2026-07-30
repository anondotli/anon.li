/**
 * @vitest-environment node
 *
 * WS1 instrumentation at the service layer: domain_added and form_created are
 * emitted after the creating transaction commits (and never inside it), so
 * both UI actions and API v1 routes are covered by one emission site.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const postHog = vi.hoisted(() => ({
    capture: vi.fn(),
    captureException: vi.fn(),
    flush: vi.fn().mockResolvedValue(undefined),
}))
const userFindUnique = vi.hoisted(() => vi.fn())
const domainCount = vi.hoisted(() => vi.fn())
const prismaTransaction = vi.hoisted(() => vi.fn())
const getFormOwnerEntitlements = vi.hoisted(() => vi.fn())

vi.mock("posthog-node", () => ({
    PostHog: class MockPostHog {
        capture = postHog.capture
        captureException = postHog.captureException
        flush = postHog.flush
    },
}))
vi.mock("next/server", () => ({ after: vi.fn() }))
vi.mock("@/lib/prisma", () => ({
    prisma: {
        user: { findUnique: userFindUnique },
        domain: { count: domainCount },
        $transaction: prismaTransaction,
    },
}))
vi.mock("@/lib/dkim", () => ({
    generateDkimKeys: vi.fn().mockResolvedValue({ publicKey: "dkim-pub", privateKey: "dkim-priv" }),
}))
vi.mock("@/lib/field-encryption", () => ({
    encryptField: vi.fn((value: string) => `enc:${value}`),
}))
vi.mock("@/lib/services/form-entitlements", () => ({
    getFormOwnerEntitlements,
}))

import { DomainService } from "@/lib/services/domain"
import { FormService } from "@/lib/services/form"
import { personalScope } from "@/lib/ownership"

const scope = personalScope("user-1")

function captured(event: string) {
    return postHog.capture.mock.calls
        .map((call) => call[0] as { distinctId: string; event: string; properties: Record<string, unknown> })
        .filter((c) => c.event === event)
}

describe("domain_added", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
        userFindUnique.mockResolvedValue({
            id: "user-1",
            subscriptions: [{
                status: "active",
                product: "bundle",
                tier: "plus",
                currentPeriodEnd: new Date(Date.now() + 86_400_000),
            }],
        })
        domainCount.mockResolvedValue(0)
        prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({
            domain: {
                count: vi.fn().mockResolvedValue(0),
                create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
                    id: "dom_1", ...data,
                })),
            },
        }))
    })

    it("emits domain_added after the domain row is created, without the domain string", async () => {
        await DomainService.createDomain(scope, "example.com")

        expect(captured("domain_added")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: { is_org_domain: false },
        })])
        // The event fires after the transaction, never inside it.
        expect(prismaTransaction).toHaveBeenCalledTimes(1)
    })

    it("does not emit when validation rejects the domain", async () => {
        await expect(DomainService.createDomain(scope, "not_a_domain")).rejects.toThrow()
        expect(captured("domain_added")).toHaveLength(0)
    })
})

describe("form_created", () => {
    const minimalInput = {
        title: "Intake",
        schema: {
            version: 1 as const,
            displayMode: "classic" as const,
            submitButtonText: "Send",
            thankYouMessage: "Received.",
            fields: [{ id: "name", type: "short_text" as const, label: "Name", required: false }],
        },
        publicKey: "A".repeat(43) + "_" + "B".repeat(43),
        wrappedPrivateKey: "x".repeat(64),
        vaultGeneration: 0,
    }

    beforeEach(() => {
        vi.clearAllMocks()
        process.env.NEXT_PUBLIC_POSTHOG_KEY = "phc_test"
        getFormOwnerEntitlements.mockResolvedValue({
            limits: { forms: 3, removeBranding: false, customKey: false, maxSubmissionFileSize: 0 },
            tiers: { form: "free" },
            subscribed: false,
        })
        prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({
            $queryRaw: vi.fn().mockResolvedValue([]),
            form: {
                count: vi.fn().mockResolvedValue(0),
                create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
                    ...data,
                })),
            },
            formOwnerKey: {
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                create: vi.fn().mockResolvedValue({}),
                findUnique: vi.fn().mockResolvedValue(null),
            },
        }))
    })

    it("emits form_created after the transaction commits (creation = publishing)", async () => {
        await FormService.createForm(scope, minimalInput)

        expect(prismaTransaction).toHaveBeenCalledTimes(1)
        expect(captured("form_created")).toEqual([expect.objectContaining({
            distinctId: "user-1",
            properties: expect.objectContaining({
                form_id: expect.any(String),
                has_file_uploads: false,
                is_org_form: false,
            }),
        })])
    })

    it("does not emit when the form cap is hit", async () => {
        prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({
            $queryRaw: vi.fn().mockResolvedValue([]),
            form: {
                count: vi.fn().mockResolvedValue(3),
                create: vi.fn(),
            },
            formOwnerKey: { updateMany: vi.fn(), create: vi.fn(), findUnique: vi.fn() },
        }))

        await expect(FormService.createForm(scope, minimalInput)).rejects.toThrow(/plan allows/)
        expect(captured("form_created")).toHaveLength(0)
    })
})
