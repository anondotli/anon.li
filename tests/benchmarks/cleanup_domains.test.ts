import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanupStaleDomains } from '@/app/api/cron/domains/route'
import { prisma } from '@/lib/prisma'
import * as resend from '@/lib/resend'

// Mock prisma
vi.mock('@/lib/prisma', () => {
    return {
        prisma: {
            domain: {
                findMany: vi.fn(),
                delete: vi.fn(),
                deleteMany: vi.fn(),
            },
        },
    }
})

// Mock resend
vi.mock('@/lib/resend', () => {
    return {
        getResendClient: vi.fn(),
        sendWelcomeEmail: vi.fn(),
        sendSubscriptionCanceledEmail: vi.fn(),
        sendPaymentActionRequiredEmail: vi.fn(),
        sendFileExpiringEmail: vi.fn(),
        sendDropExpiringEmail: vi.fn(),
        sendDownloadLimitReachedEmail: vi.fn(),
        sendDomainDeletedEmail: vi.fn(),
        sendDomainUnverifiedEmail: vi.fn(),
        sendMagicLinkEmail: vi.fn(),
        sendEmail: vi.fn(),
        sendRecipientVerificationEmail: vi.fn(),
        sendDowngradeWarningEmail: vi.fn(),
        sendResourcesScheduledForRemovalEmail: vi.fn(),
        sendResourcesDeletedEmail: vi.fn(),
        sendCryptoPaymentConfirmationEmail: vi.fn(),
        sendCryptoRenewalReminderEmail: vi.fn(),
    }
})

describe('Performance Benchmark: cleanupStaleDomains', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('measures execution time of cleanupStaleDomains', async () => {
        // Setup data
        const domainCount = 100
        const domains = Array.from({ length: domainCount }, (_, i) => ({
            id: `domain-${i}`,
            domain: `test-${i}.com`,
            verified: false,
            createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // Old enough
            user: { email: `user-${i}@example.com` }
        }))

        // Setup mocks with delays
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(prisma.domain.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(domains as any)

        ;(prisma.domain.delete as ReturnType<typeof vi.fn>).mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 10)) // 10ms db delay
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return {} as any
        })

        ;(prisma.domain.deleteMany as ReturnType<typeof vi.fn>).mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 20)) // 20ms batch db delay
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return { count: domainCount } as any
        })

        ;(resend.sendDomainDeletedEmail as ReturnType<typeof vi.fn>).mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50)) // 50ms email delay
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            return { success: true, data: {} } as any
        })

        // Run and measure
        const start = performance.now()
        const results = await cleanupStaleDomains()
        const end = performance.now()

        console.log(`cleanupStaleDomains execution time: ${(end - start).toFixed(2)}ms for ${domainCount} domains`)
        console.log('Results:', results)

        expect(results.deleted).toBe(domainCount)
        expect(prisma.domain.delete).not.toHaveBeenCalled()
        expect(prisma.domain.deleteMany).toHaveBeenCalledTimes(1)
        expect(resend.sendDomainDeletedEmail).toHaveBeenCalledTimes(domainCount)
    }, 20000)
})
