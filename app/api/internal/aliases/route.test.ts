/**
 * Tests for the internal aliases API endpoint.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { GET } from './route'
import { prisma } from '@/lib/prisma'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        alias: {
            findUnique: vi.fn(),
            findFirst: vi.fn(),
        },
        domain: {
            findFirst: vi.fn(),
        },
    },
}))

const mockAliasFindFirst = prisma.alias.findFirst as unknown as Mock
const mockDomainFindFirst = prisma.domain.findFirst as Mock

// Mock environment
const originalEnv = process.env

describe('GET /api/internal/aliases', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        process.env = { ...originalEnv, MAIL_API_SECRET: 'test-secret-123' }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    const createRequest = (options: {
        apiSecret?: string | null
        email?: string
    } = {}) => {
        const headers = new Headers()

        if (options.apiSecret !== null) {
            headers.set('X-API-Secret', options.apiSecret ?? 'test-secret-123')
        }

        let url = 'http://localhost/api/internal/aliases'
        if (options.email) {
            url += `?email=${encodeURIComponent(options.email)}`
        }

        return new Request(url, {
            method: 'GET',
            headers,
        })
    }

    describe('Authentication', () => {
        it('returns 401 when no API secret is provided', async () => {
            const request = createRequest({ apiSecret: null })
            const response = await GET(request)

            expect(response.status).toBe(401)
        })

        it('returns 401 when wrong API secret is provided', async () => {
            const request = createRequest({ apiSecret: 'wrong-secret' })
            const response = await GET(request)

            expect(response.status).toBe(401)
        })
    })

    describe('Validation', () => {
        it('returns 400 when email is missing', async () => {
            const request = createRequest()
            const response = await GET(request)

            expect(response.status).toBe(400)
            const body = await response.json()
            expect(body.error).toBe('Email query parameter required')
        })
    })

    describe('Alias Lookup', () => {
        it('returns 404 when alias is not found', async () => {
            mockAliasFindFirst.mockResolvedValue(null)
            mockDomainFindFirst.mockResolvedValue(null)

            const request = createRequest({ email: 'unknown@anon.li' })
            const response = await GET(request)

            expect(response.status).toBe(404)
            const body = await response.json()
            expect(body.error).toBe('Alias not found')
        })

        it('returns 404 when alias has no recipient', async () => {
            mockAliasFindFirst.mockResolvedValue({
                id: 'alias_123',
                email: 'test@anon.li',
                aliasRecipients: [],
                recipient: null,
            })

            const request = createRequest({ email: 'test@anon.li' })
            const response = await GET(request)

            expect(response.status).toBe(404)
            const body = await response.json()
            expect(body.error).toBe('Alias has no recipient configured')
        })

        it('returns alias details when found and active', async () => {
            const mockAlias = {
                id: 'alias_123',
                email: 'test@anon.li',
                localPart: 'test',
                domain: 'anon.li',
                userId: 'user_123',
                active: true,
                aliasRecipients: [{
                    recipient: {
                        email: 'real@gmail.com',
                        pgpPublicKey: 'BEGIN PGP PUBLIC KEY...',
                    },
                    ordinal: 0,
                    isPrimary: true,
                }],
                recipient: {
                    email: 'real@gmail.com',
                    pgpPublicKey: 'BEGIN PGP PUBLIC KEY...'
                },
                user: {
                    stripeSubscriptionId: 'sub_123'
                }
            }

            mockAliasFindFirst.mockResolvedValue(mockAlias)

            const request = createRequest({ email: 'TEST@anon.li' }) // Test case insensitivity
            const response = await GET(request)

            expect(response.status).toBe(200)
            const body = await response.json()

            expect(body.alias).toEqual({
                id: 'alias_123',
                email: 'test@anon.li',
                active: true,
                isActive: true,
                localPart: 'test',
                domain: 'anon.li',
                userId: 'user_123',
                recipients: [{
                    email: 'real@gmail.com',
                    pgpPublicKey: 'BEGIN PGP PUBLIC KEY...'
                }]
            })

            // Verify lowercase lookup
            expect(prisma.alias.findFirst).toHaveBeenCalledWith({
                where: {
                    email: 'test@anon.li',
                    active: true
                },
                include: expect.any(Object)
            })
        })
    })

    describe('Error handling', () => {
        it('returns 500 on database error', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => { })
            mockAliasFindFirst.mockRejectedValue(new Error('DB Error'))

            const request = createRequest({ email: 'test@anon.li' })
            const response = await GET(request)

            expect(response.status).toBe(500)
            consoleSpy.mockRestore()
        })
    })
})
