import { describe, it, expect, vi, beforeEach } from 'vitest'
import { AdminService } from '@/lib/services/admin'
import { prisma } from '@/lib/prisma'

// Mock resend
vi.mock('resend', () => {
    return {
        Resend: class {
            emails = {
                send: vi.fn()
            }
        }
    }
})

// Mock prisma
vi.mock('@/lib/prisma', () => {
    return {
        prisma: {
            domain: {
                findMany: vi.fn(),
                count: vi.fn(),
            },
            alias: {
                groupBy: vi.fn(),
                count: vi.fn(),
            }
        },
    }
})

describe('AdminService.listDomains', () => {
    beforeEach(() => {
        vi.clearAllMocks()
    })

    it('uses optimized groupBy instead of N+1 count queries', async () => {
        // Setup data
        const domainCount = 50
        const domains = Array.from({ length: domainCount }, (_, i) => ({
            id: `domain-${i}`,
            domain: `test-${i}.com`,
            verified: true,
            createdAt: new Date(),
            user: { id: `user-${i}`, email: `user-${i}@example.com`, name: `User ${i}` }
        }))

        // Mock return values
        ;(prisma.domain.findMany as ReturnType<typeof vi.fn>).mockResolvedValue(domains)
        ;(prisma.domain.count as ReturnType<typeof vi.fn>).mockResolvedValue(domainCount)

        // Mock groupBy to return counts
        const groupByResult = domains.map((d, index) => ({
            domain: d.domain,
            _count: { domain: index % 10 }
        }))
        ;(prisma.alias.groupBy as ReturnType<typeof vi.fn>).mockResolvedValue(groupByResult)

        // Run the function
        const result = await AdminService.listDomains({ limit: domainCount })

        // Assertions
        expect(result.domains).toHaveLength(domainCount)
        expect(prisma.domain.findMany).toHaveBeenCalledTimes(1)
        expect(prisma.alias.groupBy).toHaveBeenCalledTimes(1)

        // Critical check: Ensure count is NOT called for each domain (N+1 check)
        // Note: verify if count is called at all. It might be called for total count (pagination).
        // AdminService.listDomains calls prisma.domain.count, but NOT prisma.alias.count.
        expect(prisma.alias.count).not.toHaveBeenCalled()

        // Verify results contain alias counts
        result.domains.forEach(d => {
            expect(d).toHaveProperty('aliasCount')
            expect(typeof d.aliasCount).toBe('number')
        })
    })
})
