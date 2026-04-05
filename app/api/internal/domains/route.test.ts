/**
 * Tests for the internal domains API endpoint.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import type { Domain } from '@prisma/client'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        domain: {
            findMany: vi.fn(),
        },
    },
}))

// Mock internal API auth
vi.mock('@/lib/internal-api-auth', () => ({
    validateInternalApiSecret: vi.fn().mockReturnValue(true),
    isInternalRateLimited: vi.fn().mockResolvedValue(false),
    __esModule: true,
}))

// Imports MUST be after mocks
import { GET } from './route'
import { prisma } from '@/lib/prisma'
import { validateInternalApiSecret } from '@/lib/internal-api-auth'

const mockFindMany = prisma.domain.findMany as Mock
const mockValidateInternalApiSecret = validateInternalApiSecret as Mock

const originalEnv = process.env

// Helper to create mock domain
const createMockDomain = (domain: string): Pick<Domain, 'domain' | 'updatedAt'> => ({
    domain,
    updatedAt: new Date(),
})

describe('GET /api/internal/domains', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        // Default to authorized
        mockValidateInternalApiSecret.mockReturnValue(true)
        // Fallback for real implementation if mock is bypassed
        process.env = { ...originalEnv, MAIL_API_SECRET: 'test-secret-123' }
    })

    const createRequest = (options: {
        apiSecret?: string | null
        ifNoneMatch?: string
    } = {}) => {
        const headers = new Headers()
        
        if (options.apiSecret !== null) {
            headers.set('X-API-Secret', options.apiSecret ?? 'test-secret-123')
        }
        
        if (options.ifNoneMatch) {
            headers.set('If-None-Match', options.ifNoneMatch)
        }
        
        return new Request('http://localhost/api/internal/domains', {
            method: 'GET',
            headers,
        })
    }

    describe('Authentication', () => {
        it('returns 401 when no API secret is provided', async () => {
            mockValidateInternalApiSecret.mockReturnValue(false)
            const request = createRequest({ apiSecret: null })
            const response = await GET(request)

            expect(response.status).toBe(401)
            const body = await response.json()
            expect(body.error).toBe('Unauthorized')
        })

        it('returns 401 when wrong API secret is provided', async () => {
            mockValidateInternalApiSecret.mockReturnValue(false)
            const request = createRequest({ apiSecret: 'wrong-secret' })
            const response = await GET(request)

            expect(response.status).toBe(401)
        })

        it('returns 401 when MAIL_API_SECRET is not set', async () => {
            mockValidateInternalApiSecret.mockReturnValue(false)
            const request = createRequest()
            const response = await GET(request)

            expect(response.status).toBe(401)
        })

        it('accepts valid API secret', async () => {
            mockFindMany.mockResolvedValue([])
            
            const request = createRequest()
            const response = await GET(request)
            
            expect(response.status).toBe(200)
        })
    })

    describe('Response format', () => {
        it('returns base domains when no custom domains exist', async () => {
            mockFindMany.mockResolvedValue([])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            expect(response.status).toBe(200)
            expect(body.domains).toContain('anon.li')
            expect(body.domains).toContain('reply.anon.li')
            expect(body.count).toBe(2)
        })

        it('includes custom verified domains', async () => {
            mockFindMany.mockResolvedValue([
                createMockDomain('custom.com'),
                createMockDomain('another.org'),
            ] as Domain[])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            expect(body.domains).toContain('custom.com')
            expect(body.domains).toContain('another.org')
            expect(body.domains).toContain('anon.li')
            expect(body.count).toBe(4)
        })

        it('includes checksum in response', async () => {
            mockFindMany.mockResolvedValue([])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            expect(body.checksum).toBeDefined()
            expect(body.checksum).toMatch(/^sha256:[a-f0-9]{16}$/)
        })

        it('includes generatedAt timestamp', async () => {
            mockFindMany.mockResolvedValue([])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            expect(body.generatedAt).toBeDefined()
            expect(new Date(body.generatedAt).getTime()).toBeGreaterThan(0)
        })

        it('includes metadata', async () => {
            mockFindMany.mockResolvedValue([
                createMockDomain('custom.com'),
            ] as Domain[])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            expect(body.meta).toBeDefined()
            expect(body.meta.baseDomains).toBe(2)
            expect(body.meta.customDomains).toBe(1)
        })

        it('sorts domains alphabetically', async () => {
            mockFindMany.mockResolvedValue([
                createMockDomain('zebra.com'),
                createMockDomain('apple.org'),
            ] as Domain[])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            const domains = body.domains as string[]
            for (let i = 1; i < domains.length; i++) {
                expect(domains[i]!.localeCompare(domains[i - 1]!)).toBeGreaterThanOrEqual(0)
            }
        })

        it('deduplicates domains', async () => {
            mockFindMany.mockResolvedValue([
                createMockDomain('anon.li'), // Duplicate of base domain
                createMockDomain('custom.com'),
            ] as Domain[])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            const anonLiCount = body.domains.filter((d: string) => d === 'anon.li').length
            expect(anonLiCount).toBe(1)
        })

        it('normalizes domains to lowercase', async () => {
            mockFindMany.mockResolvedValue([
                createMockDomain('UPPERCASE.COM'),
            ] as Domain[])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            expect(body.domains).toContain('uppercase.com')
            expect(body.domains).not.toContain('UPPERCASE.COM')
        })
    })

    describe('Caching headers', () => {
        it('includes ETag header', async () => {
            mockFindMany.mockResolvedValue([])
            
            const request = createRequest()
            const response = await GET(request)
            
            expect(response.headers.get('ETag')).toBeDefined()
            expect(response.headers.get('ETag')).toMatch(/^"[a-f0-9]{16}"$/)
        })

        it('includes Cache-Control header', async () => {
            mockFindMany.mockResolvedValue([])
            
            const request = createRequest()
            const response = await GET(request)
            
            const cacheControl = response.headers.get('Cache-Control')
            expect(cacheControl).toContain('private')
            expect(cacheControl).toContain('max-age=60')
        })

        it('includes X-Domains-Count header', async () => {
            mockFindMany.mockResolvedValue([
                createMockDomain('test.com'),
            ] as Domain[])
            
            const request = createRequest()
            const response = await GET(request)
            
            expect(response.headers.get('X-Domains-Count')).toBe('3')
        })

        it('returns 304 when ETag matches', async () => {
            // Use a mock domain to ensure consistent timestamp for ETag generation
            // otherwise 'new Date()' is used which changes between requests
            mockFindMany.mockResolvedValue([
                createMockDomain('test.com')
            ] as Domain[])

            // First request to get ETag
            const firstRequest = createRequest()
            const firstResponse = await GET(firstRequest)
            const etag = firstResponse.headers.get('ETag')!

            // Second request with If-None-Match
            const secondRequest = createRequest({ ifNoneMatch: etag })
            const secondResponse = await GET(secondRequest)

            expect(secondResponse.status).toBe(304)
        })
    })

    describe('Error handling', () => {
        it('returns 500 on database error', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            mockFindMany.mockImplementation(() => Promise.reject(new Error('Database error')))

            const request = createRequest()
            const response = await GET(request)

            expect(response.status).toBe(500)
            const body = await response.json()
            expect(body.error).toBeDefined()
            consoleSpy.mockRestore()
        })

        it('returns 503 on connection error', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            mockFindMany.mockImplementation(() =>
                Promise.reject(new Error('Unable to connect to database'))
            )

            const request = createRequest()
            const response = await GET(request)

            expect(response.status).toBe(503)
            expect(response.headers.get('Retry-After')).toBe('30')
            consoleSpy.mockRestore()
        })

        it('includes request duration header on error', async () => {
            const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
            mockFindMany.mockImplementation(() => Promise.reject(new Error('Error')))

            const request = createRequest()
            const response = await GET(request)

            expect(response.headers.get('X-Request-Duration-Ms')).toBeDefined()
            consoleSpy.mockRestore()
        })
    })

    describe('Domain filtering', () => {
        it('filters out empty domains', async () => {
            mockFindMany.mockResolvedValue([
                createMockDomain(''),
                createMockDomain('valid.com'),
            ] as Domain[])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            expect(body.domains).not.toContain('')
            expect(body.domains).toContain('valid.com')
        })

        it('filters out domains without dots', async () => {
            mockFindMany.mockResolvedValue([
                createMockDomain('nodot'),
                createMockDomain('valid.com'),
            ] as Domain[])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            expect(body.domains).not.toContain('nodot')
            expect(body.domains).toContain('valid.com')
        })

        it('trims whitespace from domains', async () => {
            mockFindMany.mockResolvedValue([
                createMockDomain('  spaces.com  '),
            ] as Domain[])
            
            const request = createRequest()
            const response = await GET(request)
            const body = await response.json()
            
            expect(body.domains).toContain('spaces.com')
            expect(body.domains).not.toContain('  spaces.com  ')
        })
    })
})