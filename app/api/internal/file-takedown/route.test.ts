/**
 * Tests for the internal file takedown API endpoint.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest'
import { POST } from './route'
import { prisma } from '@/lib/prisma'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        drop: {
            findUnique: vi.fn(),
            update: vi.fn(),
        },
        user: {
            update: vi.fn(),
        },
        $queryRaw: vi.fn(),
    },
}))

// Mock Resend
vi.mock('resend', () => ({
    Resend: vi.fn().mockImplementation(() => ({
        emails: {
            send: vi.fn(),
        },
    })),
}))

// Mock react-email render
vi.mock('@react-email/render', () => ({
    render: vi.fn().mockResolvedValue('<html>Email Content</html>'),
}))

// Mock Email Components
vi.mock('@/components/email/drop-takedown', () => ({
    DropTakedownEmail: vi.fn(),
}))

vi.mock('@/components/email/account-banned', () => ({
    AccountBannedEmail: vi.fn(),
}))

const mockDropFindUnique = prisma.drop.findUnique as Mock

// Mock environment
const originalEnv = process.env

describe('/api/internal/file-takedown', () => {
    beforeEach(() => {
        vi.resetAllMocks()
        process.env = { ...originalEnv, MAIL_API_SECRET: 'test-secret-123', AUTH_RESEND_KEY: 'resend_123' }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    const createRequest = (options: {
        token?: string | null
        apiSecret?: string
        body?: Record<string, unknown>
    } = {}) => {
        const headers = new Headers()

        if (options.token !== null) {
            headers.set('Authorization', `Bearer ${options.token ?? 'test-secret-123'}`)
        }
        if (options.apiSecret) {
            headers.set('X-API-Secret', options.apiSecret)
        }

        return new Request('http://localhost/api/internal/file-takedown', {
            method: 'POST',
            headers,
            body: options.body ? JSON.stringify(options.body) : undefined,
        })
    }

    describe('Authentication', () => {
        it('returns 401 when unauthorized', async () => {
            const request = createRequest({ token: 'wrong-token' })
            const response = await POST(request)
            expect(response.status).toBe(401)
        })

        it('returns 401 when no token', async () => {
            const request = createRequest({ token: null })
            const response = await POST(request)
            expect(response.status).toBe(401)
        })

        it('accepts the shared X-API-Secret header', async () => {
            mockDropFindUnique.mockResolvedValue(null)
            const request = createRequest({ token: null, apiSecret: 'test-secret-123', body: { dropId: 'drop-123', reason: 'violation' } })
            const response = await POST(request)
            expect(response.status).toBe(404)
        })
    })

    describe('Validation', () => {
        it('returns 400 when missing dropId', async () => {
            const request = createRequest({ body: { reason: 'violation' } })
            const response = await POST(request)
            expect(response.status).toBe(400)
            const json = await response.json()
            expect(json.error).toBe('Invalid input')
        })

        it('returns 400 when missing reason', async () => {
            const request = createRequest({ body: { dropId: 'drop-123' } })
            const response = await POST(request)
            expect(response.status).toBe(400)
            const json = await response.json()
            expect(json.error).toBe('Invalid input')
        })
    })

    describe('Takedown Logic', () => {
        const validBody = {
            dropId: 'drop-123',
            reason: 'DMCA Takedown'
        }

        it('returns 404 if drop not found', async () => {
            mockDropFindUnique.mockResolvedValue(null)

            const request = createRequest({ body: validBody })
            const response = await POST(request)

            expect(response.status).toBe(404)
        })

        it('returns 400 if already taken down', async () => {
            mockDropFindUnique.mockResolvedValue({
                id: 'drop-123',
                takenDown: true
            } as unknown as Awaited<ReturnType<typeof prisma.drop.findUnique>>)

            const request = createRequest({ body: validBody })
            const response = await POST(request)

            expect(response.status).toBe(400)
            const json = await response.json()
            expect(json.error).toBe('Drop already taken down')
        })

        it('processes takedown for anonymous drop (no user)', async () => {
            mockDropFindUnique.mockResolvedValue({
                id: 'drop-123',
                takenDown: false,
                user: null
            } as unknown as Awaited<ReturnType<typeof prisma.drop.findUnique>>)

            const request = createRequest({ body: validBody })
            const response = await POST(request)
            const json = await response.json()

            expect(response.status).toBe(200)
            expect(json.success).toBe(true)
            expect(json.ownerNotified).toBe(false)

            // Verify DB Update
            expect(prisma.drop.update).toHaveBeenCalledWith({
                where: { id: 'drop-123' },
                data: expect.objectContaining({
                    takenDown: true,
                    disabled: true,
                    takedownReason: 'DMCA Takedown'
                })
            })
        })

        it('processes takedown for user drop and adds strike', async () => {
            const mockUser = {
                id: 'user-123',
                email: 'user@example.com',
                tosViolations: 0,
                banned: false
            }

            mockDropFindUnique.mockResolvedValue({
                id: 'drop-123',
                takenDown: false,
                user: mockUser
            } as unknown as Awaited<ReturnType<typeof prisma.drop.findUnique>>)

            // Mock atomic SQL update
            ;(prisma.$queryRaw as Mock).mockResolvedValue([{ tosViolations: 1, banned: false }])

            const request = createRequest({ body: validBody })
            const response = await POST(request)
            const json = await response.json()

            expect(json.success).toBe(true)
            expect(json.ownerNotified).toBe(true)
            expect(json.strikeCount).toBe(1)
            expect(json.userBanned).toBe(false)

            // Verify atomic SQL was called
            expect(prisma.$queryRaw).toHaveBeenCalled()
        })

        it('bans user when max strikes reached', async () => {
            const mockUser = {
                id: 'user-123',
                email: 'user@example.com',
                tosViolations: 2, // 2 strikes + 1 new = 3 (MAX)
                banned: false
            }

            mockDropFindUnique.mockResolvedValue({
                id: 'drop-123',
                takenDown: false,
                user: mockUser
            } as unknown as Awaited<ReturnType<typeof prisma.drop.findUnique>>)

            // Mock atomic SQL update - returns banned state
            ;(prisma.$queryRaw as Mock).mockResolvedValue([{ tosViolations: 3, banned: true }])

            const request = createRequest({ body: validBody })
            const response = await POST(request)
            const json = await response.json()

            expect(json.strikeCount).toBe(3)
            expect(json.userBanned).toBe(true)

            // Verify atomic SQL was called
            expect(prisma.$queryRaw).toHaveBeenCalled()
        })
    })
})
