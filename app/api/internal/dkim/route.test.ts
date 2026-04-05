/**
 * Tests for the internal DKIM API endpoint.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { GET } from './route'
import { prisma } from '@/lib/prisma'
import fs from 'fs/promises'
import { validateInternalApiSecret } from '@/lib/internal-api-auth'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        domain: {
            findFirst: vi.fn(),
        },
    },
}))

// Mock fs
vi.mock('fs/promises', () => ({
    default: {
        readFile: vi.fn(),
    },
}))

// Mock internal API auth
vi.mock('@/lib/internal-api-auth', () => ({
    validateInternalApiSecret: vi.fn().mockReturnValue(true),
    isInternalRateLimited: vi.fn().mockResolvedValue(false),
}))

const mockFindFirst = prisma.domain.findFirst as Mock
const mockReadFile = fs.readFile as Mock
const mockValidateInternalApiSecret = validateInternalApiSecret as Mock

// Mock environment
const originalEnv = process.env

describe('/api/internal/dkim', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        mockValidateInternalApiSecret.mockReturnValue(true)
        process.env = { ...originalEnv, MAIL_API_SECRET: 'test-secret-123' }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    const createRequest = (options: {
        apiSecret?: string | null
        domain?: string
    } = {}) => {
        const headers = new Headers()

        if (options.apiSecret !== null) {
            headers.set('X-API-Secret', options.apiSecret ?? 'test-secret-123')
        }

        let url = 'http://localhost/api/internal/dkim'
        if (options.domain) {
            url += `?domain=${encodeURIComponent(options.domain)}`
        }

        return new Request(url, {
            method: 'GET',
            headers,
        })
    }

    describe('Authentication', () => {
        it('returns 401 when unauthorized', async () => {
            mockValidateInternalApiSecret.mockReturnValue(false)
            const request = createRequest({ apiSecret: 'wrong' })
            const response = await GET(request)
            expect(response.status).toBe(401)
        })
    })

    describe('Validation', () => {
        it('returns 400 when domain is missing', async () => {
            const request = createRequest()
            const response = await GET(request)
            expect(response.status).toBe(400)
        })

        it('returns 400 when domain format is invalid', async () => {
            const request = createRequest({ domain: '-invalid.com' })
            const response = await GET(request)
            expect(response.status).toBe(400)
        })
    })

    describe('DKIM Lookup', () => {
        it('returns DKIM from database if found', async () => {
            mockFindFirst.mockResolvedValue({
                domain: 'custom.com',
                dkimPrivateKey: 'PRIVATE KEY',
                dkimSelector: 'mail'
            } as unknown as Awaited<ReturnType<typeof prisma.domain.findFirst>>)

            const request = createRequest({ domain: 'custom.com' })
            const response = await GET(request)
            const json = await response.json()

            expect(json.privateKey).toBe('PRIVATE KEY')
            expect(json.selector).toBe('mail')
        })

        it('falls back to file system if not in DB', async () => {
             mockFindFirst.mockResolvedValue(null)

             // Mock file read success
             mockReadFile.mockResolvedValue('FILE PRIVATE KEY')

             const request = createRequest({ domain: 'anon.li' })
             const response = await GET(request)
             const json = await response.json()

             expect(json.privateKey).toBe('FILE PRIVATE KEY')
             expect(json.selector).toBe('default')
        })

        it('returns 404 if not found in DB or FS', async () => {
             mockFindFirst.mockResolvedValue(null)
             mockReadFile.mockRejectedValue(new Error('File not found'))

             const request = createRequest({ domain: 'unknown.com' })
             const response = await GET(request)

             expect(response.status).toBe(404)
        })
    })
})
