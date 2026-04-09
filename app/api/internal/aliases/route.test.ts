/**
 * Tests for the internal aliases API endpoint.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest"

vi.mock("@/lib/prisma", () => {
    const mockPrisma = {
        alias: {
            findFirst: vi.fn(),
            count: vi.fn(),
            create: vi.fn(),
        },
        aliasRecipient: {
            create: vi.fn(),
        },
        domain: {
            findFirst: vi.fn(),
        },
        $transaction: vi.fn(async (arg: unknown) => {
            if (typeof arg === "function") {
                return arg(mockPrisma)
            }
            return arg
        }),
    }
    return { prisma: mockPrisma }
})

vi.mock("@/lib/internal-api-auth", () => ({
    validateInternalApiSecret: vi.fn().mockReturnValue(true),
    isInternalRateLimited: vi.fn().mockResolvedValue(false),
}))

vi.mock("@/lib/limits", () => ({
    getPlanLimitsAsync: vi.fn().mockResolvedValue({
        random: 10,
        custom: 1,
        domains: 0,
        apiRequests: 500,
        recipients: 1,
        recipientsPerAlias: 1,
    }),
}))

vi.mock("@/lib/logger", () => ({
    createLogger: vi.fn(() => ({
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
    })),
}))

import { GET } from "./route"
import { prisma } from "@/lib/prisma"
import { getPlanLimitsAsync } from "@/lib/limits"
import { isInternalRateLimited, validateInternalApiSecret } from "@/lib/internal-api-auth"

const mockAliasFindFirst = prisma.alias.findFirst as Mock
const mockAliasCount = prisma.alias.count as Mock
const mockAliasCreate = prisma.alias.create as Mock
const mockAliasRecipientCreate = prisma.aliasRecipient.create as Mock
const mockDomainFindFirst = prisma.domain.findFirst as Mock
const mockTransaction = prisma.$transaction as Mock
const mockGetPlanLimitsAsync = getPlanLimitsAsync as Mock
const mockValidateInternalApiSecret = validateInternalApiSecret as Mock
const mockIsInternalRateLimited = isInternalRateLimited as Mock

const originalEnv = process.env

describe("GET /api/internal/aliases", () => {
    beforeEach(() => {
        vi.clearAllMocks()
        process.env = { ...originalEnv, MAIL_API_SECRET: "test-secret-123" }
        mockValidateInternalApiSecret.mockReturnValue(true)
        mockIsInternalRateLimited.mockResolvedValue(false)
        mockGetPlanLimitsAsync.mockResolvedValue({
            random: 10,
            custom: 1,
            domains: 0,
            apiRequests: 500,
            recipients: 1,
            recipientsPerAlias: 1,
        })
    })

    afterEach(() => {
        process.env = originalEnv
    })

    function createRequest(options: {
        apiSecret?: string | null
        email?: string
    } = {}) {
        const headers = new Headers()

        if (options.apiSecret !== null) {
            headers.set("X-API-Secret", options.apiSecret ?? "test-secret-123")
        }

        let url = "http://localhost/api/internal/aliases"
        if (options.email) {
            url += `?email=${encodeURIComponent(options.email)}`
        }

        return new Request(url, {
            method: "GET",
            headers,
        })
    }

    describe("Authentication", () => {
        it("returns 401 when no API secret is provided", async () => {
            mockValidateInternalApiSecret.mockReturnValue(false)

            const response = await GET(createRequest({ apiSecret: null }))

            expect(response.status).toBe(401)
        })

        it("returns 401 when wrong API secret is provided", async () => {
            mockValidateInternalApiSecret.mockReturnValue(false)

            const response = await GET(createRequest({ apiSecret: "wrong-secret" }))

            expect(response.status).toBe(401)
        })
    })

    describe("Validation", () => {
        it("returns 400 when email is missing", async () => {
            const response = await GET(createRequest())

            expect(response.status).toBe(400)
            expect(await response.json()).toEqual({ error: "Email query parameter required" })
        })
    })

    describe("Alias Lookup", () => {
        it("returns 404 when alias is not found", async () => {
            mockAliasFindFirst.mockResolvedValue(null)
            mockDomainFindFirst.mockResolvedValue(null)

            const response = await GET(createRequest({ email: "unknown@anon.li" }))

            expect(response.status).toBe(404)
            expect(await response.json()).toEqual({ error: "Alias not found" })
        })

        it("returns 404 when alias has no recipient", async () => {
            mockAliasFindFirst.mockResolvedValue({
                id: "alias_123",
                email: "test@anon.li",
                aliasRecipients: [],
                recipient: null,
            })

            const response = await GET(createRequest({ email: "test@anon.li" }))

            expect(response.status).toBe(404)
            expect(await response.json()).toEqual({ error: "Alias has no recipient configured" })
        })

        it("returns alias details when found and active", async () => {
            mockAliasFindFirst.mockResolvedValue({
                id: "alias_123",
                email: "test@anon.li",
                localPart: "test",
                domain: "anon.li",
                userId: "user_123",
                active: true,
                aliasRecipients: [{
                    recipient: {
                        email: "real@gmail.com",
                        pgpPublicKey: "BEGIN PGP PUBLIC KEY...",
                    },
                    ordinal: 0,
                    isPrimary: true,
                }],
                recipient: {
                    email: "real@gmail.com",
                    pgpPublicKey: "BEGIN PGP PUBLIC KEY...",
                },
                user: {
                    stripeSubscriptionId: "sub_123",
                },
            })

            const response = await GET(createRequest({ email: "TEST@anon.li" }))

            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({
                alias: {
                    id: "alias_123",
                    email: "test@anon.li",
                    active: true,
                    isActive: true,
                    localPart: "test",
                    domain: "anon.li",
                    userId: "user_123",
                    recipients: [{
                        email: "real@gmail.com",
                        pgpPublicKey: "BEGIN PGP PUBLIC KEY...",
                    }],
                },
            })

            expect(mockAliasFindFirst).toHaveBeenCalledWith({
                where: {
                    email: "test@anon.li",
                    active: true,
                },
                include: expect.any(Object),
            })
        })

        it("creates a catch-all random alias for pro users below the hidden random alias cap", async () => {
            mockAliasFindFirst.mockResolvedValueOnce(null)
            mockDomainFindFirst.mockResolvedValue({
                userId: "user_pro",
                catchAllRecipientId: "recipient_1",
                domain: "example.com",
            })
            mockGetPlanLimitsAsync.mockResolvedValue({
                random: 10000,
                custom: 100,
                domains: 10,
                apiRequests: 100000,
                recipients: 10,
                recipientsPerAlias: 5,
            })
            mockAliasCount.mockResolvedValue(500)
            mockAliasCreate.mockResolvedValue({
                id: "alias_new",
                email: "sales@example.com",
                localPart: "sales",
                domain: "example.com",
                userId: "user_pro",
                recipient: {
                    email: "real@gmail.com",
                    pgpPublicKey: null,
                },
            })
            mockAliasRecipientCreate.mockResolvedValue({})

            const response = await GET(createRequest({ email: "sales@example.com" }))

            expect(response.status).toBe(200)
            expect(await response.json()).toEqual({
                alias: {
                    id: "alias_new",
                    email: "sales@example.com",
                    active: true,
                    isActive: true,
                    localPart: "sales",
                    domain: "example.com",
                    userId: "user_pro",
                    recipients: [{
                        email: "real@gmail.com",
                        pgpPublicKey: null,
                    }],
                },
            })

            expect(mockAliasCount).toHaveBeenCalledWith({
                where: { userId: "user_pro", format: "RANDOM" },
            })
            expect(mockTransaction).toHaveBeenCalledWith(expect.any(Function))
        })
    })

    describe("Error handling", () => {
        it("returns 500 on database error", async () => {
            const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})
            mockAliasFindFirst.mockRejectedValue(new Error("DB Error"))

            const response = await GET(createRequest({ email: "test@anon.li" }))

            expect(response.status).toBe(500)
            consoleSpy.mockRestore()
        })
    })
})
