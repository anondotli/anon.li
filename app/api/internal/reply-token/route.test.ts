/**
 * Tests for the internal reply-token API endpoint.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { NextRequest } from 'next/server'
import { GET, POST } from './route'
import { _clearKeyCache } from '@/lib/reply-token-crypto'

// Mock internal API auth
vi.mock('@/lib/internal-api-auth', () => ({
    validateInternalApiSecret: vi.fn(),
    isInternalRateLimited: vi.fn().mockResolvedValue(false),
}))

import { validateInternalApiSecret } from '@/lib/internal-api-auth'

const mockValidateInternalApiSecret = validateInternalApiSecret as Mock

const TEST_SECRET = 'test-mail-api-secret-at-least-32-bytes-long'

describe('/api/internal/reply-token', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        _clearKeyCache()
        process.env.MAIL_API_SECRET = TEST_SECRET
        mockValidateInternalApiSecret.mockReturnValue(true)
    })

    afterEach(() => {
        _clearKeyCache()
    })

    const createRequest = (method: 'GET' | 'POST', options: {
        body?: Record<string, unknown>
        params?: Record<string, string>
    } = {}) => {
        const headers = new Headers()

        let url = 'http://localhost/api/internal/reply-token'
        if (options.params) {
            const searchParams = new URLSearchParams(options.params)
            url += `?${searchParams.toString()}`
        }

        return new NextRequest(url, {
            method,
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
        })
    }

    describe('Authentication', () => {
        it('POST returns 401 when unauthorized', async () => {
            mockValidateInternalApiSecret.mockReturnValue(false)
            const request = createRequest('POST', { body: {} })
            const response = await POST(request)
            expect(response.status).toBe(401)
        })

        it('GET returns 401 when unauthorized', async () => {
            mockValidateInternalApiSecret.mockReturnValue(false)
            const request = createRequest('GET')
            const response = await GET(request)
            expect(response.status).toBe(401)
        })
    })

    describe('POST (Create Token)', () => {
        const validBody = {
            originalSender: 'sender@example.com',
            aliasEmail: 'alias@anon.li',
            recipientEmail: 'user@gmail.com',
        }

        it('returns 400 if fields are missing', async () => {
            const request = createRequest('POST', { body: {} })
            const response = await POST(request)
            expect(response.status).toBe(400)
        })

        it('creates a stateless token successfully', async () => {
            const request = createRequest('POST', { body: validBody })
            const response = await POST(request)
            const json = await response.json()

            expect(response.status).toBe(200)
            expect(typeof json.token).toBe('string')
            expect(json.token.length).toBeGreaterThan(0)
        })
    })

    describe('GET (Retrieve Token)', () => {
        it('returns 400 if token missing', async () => {
            const request = createRequest('GET')
            const response = await GET(request)
            expect(response.status).toBe(400)
        })

        it('returns 404 for unknown token', async () => {
            const request = createRequest('GET', { params: { token: 'unknown-garbage' } })
            const response = await GET(request)
            expect(response.status).toBe(404)
        })
    })

    describe('Stateless round-trip', () => {
        const validBody = {
            originalSender: 'sender@example.com',
            aliasEmail: 'alias@anon.li',
            recipientEmail: 'user@gmail.com',
        }

        it('POST → GET returns correct fields', async () => {
            const postReq = createRequest('POST', { body: validBody })
            const postRes = await POST(postReq)
            const { token } = await postRes.json()

            const getReq = createRequest('GET', { params: { token } })
            const getRes = await GET(getReq)
            const json = await getRes.json()

            expect(getRes.status).toBe(200)
            expect(json.token).toBe(token)
            expect(json.originalSender).toBe('sender@example.com')
            expect(json.aliasEmail).toBe('alias@anon.li')
            expect(json.recipientEmail).toBe('user@gmail.com')
            expect(json.expiresAt).toBeDefined()
        })

        it('returns 404 for expired token', async () => {
            const { createReplyToken } = await import('@/lib/reply-token-crypto')

            const token = createReplyToken('a@b.com', 'c@d.com', 'e@f.com')

            const realDateNow = Date.now
            try {
                // Move time forward 8 days (past the 7-day TTL)
                Date.now = () => realDateNow() + 8 * 24 * 60 * 60 * 1000

                const getReq = createRequest('GET', { params: { token } })
                const getRes = await GET(getReq)
                expect(getRes.status).toBe(404)
            } finally {
                Date.now = realDateNow
            }
        })

        it('returns 404 for tampered token', async () => {
            const postReq = createRequest('POST', { body: validBody })
            const postRes = await POST(postReq)
            const { token } = await postRes.json()

            // Flip a byte in the middle of the token
            const buf = Buffer.from(token, 'base64url')
            const index = Math.floor(buf.length / 2)
            buf[index] = (buf[index] ?? 0) ^ 0xff
            const tampered = buf.toString('base64url')

            const getReq = createRequest('GET', { params: { token: tampered } })
            const getRes = await GET(getReq)
            expect(getRes.status).toBe(404)
        })
    })
})
