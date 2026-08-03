import { describe, it, expect, vi, beforeEach } from 'vitest'
import { cleanupStaleDomains } from '@/lib/services/cron-domains'
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

describe('cleanupStaleDomains batching', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('batch-deletes stale domains and notifies every owner', async () => {
        // Setup data
        const domainCount = 100
        const domains = Array.from({ length: domainCount }, (_, i) => ({
            id: `domain-${i}`,
            domain: `test-${i}.com`,
            verified: false,
            createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // Old enough
            user: { email: `user-${i}@example.com` }
        }))

        // The cleanup should issue one database delete while retaining a
        // notification for every affected owner.
        ;(prisma.domain.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(domains)
        ;(prisma.domain.deleteMany as ReturnType<typeof vi.fn>).mockResolvedValue({ count: domainCount })
        ;(resend.sendDomainDeletedEmail as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, data: {} })

        const results = await cleanupStaleDomains()

        expect(results.deleted).toBe(domainCount)
        expect(prisma.domain.delete).not.toHaveBeenCalled()
        expect(prisma.domain.deleteMany).toHaveBeenCalledTimes(1)
        expect(resend.sendDomainDeletedEmail).toHaveBeenCalledTimes(domainCount)
    }, 20000)
})
