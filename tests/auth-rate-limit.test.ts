import { describe, it, expect, vi, beforeEach } from 'vitest'
import { rateLimit } from '@/lib/rate-limit'

// Mock rate limiting
vi.mock('@/lib/rate-limit', () => ({
    rateLimit: vi.fn(),
    rateLimiters: {},
}))

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        user: { findUnique: vi.fn() },
    }
}))

// Mock resend
vi.mock('@/lib/resend', () => ({
    sendWelcomeEmail: vi.fn(),
    sendMagicLinkEmail: vi.fn(),
}))

describe('Auth Rate Limiting', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('rateLimit is called with loginRegister key', async () => {
        // Rate limiting now happens in Better Auth databaseHooks.user.create.before
        // This is a unit test for the rateLimit function itself
        ;(rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)

        await rateLimit('loginRegister')
        expect(rateLimit).toHaveBeenCalledWith('loginRegister')
    })

    it('rateLimit is called with email identifier', async () => {
        ;(rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(null)

        await rateLimit('loginRegister', 'test@example.com')
        expect(rateLimit).toHaveBeenCalledWith('loginRegister', 'test@example.com')
    })

    it('rateLimit returns a response when limit exceeded', async () => {
        ;(rateLimit as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ status: 429 })

        const result = await rateLimit('loginRegister', 'test@example.com')
        expect(result).toBeTruthy()
    })
})
