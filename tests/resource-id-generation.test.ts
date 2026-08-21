/**
 * Drop / Form id generation length + collision handling.
 * @vitest-environment node
 *
 * Ids are 8 lowercase-base36 chars (~41 bits). That is a much smaller keyspace
 * than the previous 16/12 chars, so creation now handles a collision instead of
 * surfacing a raw Prisma P2002 as a 500.
 */
import { beforeEach, describe, expect, it, vi } from "vitest"

const dropCreate = vi.hoisted(() => vi.fn())
const formFindUnique = vi.hoisted(() => vi.fn())
const prismaTransaction = vi.hoisted(() => vi.fn())
const getFormOwnerEntitlements = vi.hoisted(() => vi.fn())

vi.mock("@/lib/prisma", () => ({
    prisma: {
        drop: { create: dropCreate },
        form: { findUnique: formFindUnique },
        $transaction: prismaTransaction,
    },
}))
vi.mock("@/lib/storage", () => ({
    abortMultipartUpload: vi.fn(),
    completeMultipartUpload: vi.fn(),
    getPresignedDownloadUrl: vi.fn(),
    getObjectMetadata: vi.fn(),
    deleteObject: vi.fn(),
    generateStorageKey: vi.fn(),
    initiateMultipartUpload: vi.fn(),
}))
vi.mock("@/lib/drop-utils", () => ({
    calculateExpiry: vi.fn().mockReturnValue(null),
    getUserAndLimits: vi.fn(),
    validateFileSize: vi.fn(),
    validateInputLengths: vi.fn(),
    enforceFeatureFlags: vi.fn().mockReturnValue({
        hideBranding: false,
        notifyOnDownload: false,
        customKey: false,
    }),
    generateSessionToken: vi.fn(),
    storeDropSession: vi.fn(),
    verifyDropSession: vi.fn(),
}))
vi.mock("@/lib/services/form-entitlements", () => ({ getFormOwnerEntitlements }))
vi.mock("@/lib/posthog.server", () => ({ trackServerEvent: vi.fn() }))
vi.mock("next/server", () => ({ after: vi.fn() }))

import { Prisma } from "@prisma/client"
import { DropService } from "@/lib/services/drop"
import { FormService } from "@/lib/services/form"
import { personalScope } from "@/lib/ownership"

const EIGHT_CHAR_ID = /^[a-z0-9]{8}$/

/** A drop-id primary-key collision as Prisma reports it. */
function uniqueViolation(): Prisma.PrismaClientKnownRequestError {
    return new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
        code: "P2002",
        clientVersion: "test",
        meta: { target: ["id"] },
    })
}

// Guest drops (scope null) take the static-config path, so no user/limit lookups.
const guestInput = { iv: "0123456789abcdef", fileCount: 1 }

/** The `data` payload handed to prisma.drop.create on the nth call. */
function createdData(call: number): Record<string, unknown> {
    return dropCreate.mock.calls[call]![0].data as Record<string, unknown>
}

describe("drop id generation", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        dropCreate.mockResolvedValue({})
    })

    it("mints an 8-char lowercase-base36 id", async () => {
        const { dropId } = await DropService.createDrop(null, guestInput)

        expect(dropId).toMatch(EIGHT_CHAR_ID)
        expect(dropCreate).toHaveBeenCalledTimes(1)
        // The id written to the row is the one returned to the caller.
        expect(createdData(0).id).toBe(dropId)
    })

    it("mints distinct ids across calls", async () => {
        const ids = new Set<string>()
        for (let i = 0; i < 25; i++) {
            const { dropId } = await DropService.createDrop(null, guestInput)
            ids.add(dropId)
        }
        expect(ids.size).toBe(25)
    })

    it("regenerates and retries when the id collides", async () => {
        dropCreate.mockRejectedValueOnce(uniqueViolation()).mockResolvedValueOnce({})

        const { dropId } = await DropService.createDrop(null, guestInput)

        expect(dropCreate).toHaveBeenCalledTimes(2)
        expect(createdData(0).id).not.toBe(createdData(1).id)
        expect(createdData(1).id).toBe(dropId)
        expect(dropId).toMatch(EIGHT_CHAR_ID)
    })

    it("gives up after 5 collisions rather than looping forever", async () => {
        dropCreate.mockRejectedValue(uniqueViolation())

        await expect(DropService.createDrop(null, guestInput)).rejects.toMatchObject({ code: "P2002" })
        expect(dropCreate).toHaveBeenCalledTimes(5)
    })

    it("does not retry a non-collision error", async () => {
        dropCreate.mockRejectedValue(new Error("connection reset"))

        await expect(DropService.createDrop(null, guestInput)).rejects.toThrow("connection reset")
        expect(dropCreate).toHaveBeenCalledTimes(1)
    })
})

describe("form id generation", () => {
    const scope = personalScope("user-1")
    const input = {
        title: "Intake",
        schema: {
            version: 1 as const,
            title: "Intake",
            notifyOnSubmission: true,
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
        formFindUnique.mockResolvedValue(null)
        getFormOwnerEntitlements.mockResolvedValue({
            limits: { forms: 3, removeBranding: false, customKey: false, maxSubmissionFileSize: 0 },
            tiers: { form: "free" },
            subscribed: false,
        })
        prismaTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => cb({
            $queryRaw: vi.fn().mockResolvedValue([]),
            form: {
                count: vi.fn().mockResolvedValue(0),
                create: vi.fn().mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({ ...data })),
            },
            formOwnerKey: {
                updateMany: vi.fn().mockResolvedValue({ count: 1 }),
                create: vi.fn().mockResolvedValue({}),
                findUnique: vi.fn().mockResolvedValue(null),
            },
        }))
    })

    it("mints an 8-char lowercase-base36 id", async () => {
        const form = await FormService.createForm(scope, input)

        expect(form.id).toMatch(EIGHT_CHAR_ID)
        // The candidate is probed for availability before the transaction opens.
        expect(formFindUnique).toHaveBeenCalledWith({
            where: { id: form.id },
            select: { id: true },
        })
    })

    it("skips an id that is already taken", async () => {
        formFindUnique
            .mockResolvedValueOnce({ id: "taken001" })
            .mockResolvedValueOnce(null)

        const form = await FormService.createForm(scope, input)

        expect(formFindUnique).toHaveBeenCalledTimes(2)
        expect(form.id).not.toBe("taken001")
        expect(form.id).toMatch(EIGHT_CHAR_ID)
    })

    it("gives up after 5 taken ids instead of looping forever", async () => {
        formFindUnique.mockResolvedValue({ id: "alwaystk" })

        await expect(FormService.createForm(scope, input)).rejects.toThrow(/allocate a form id/)
        expect(formFindUnique).toHaveBeenCalledTimes(5)
        expect(prismaTransaction).not.toHaveBeenCalled()
    })
})
