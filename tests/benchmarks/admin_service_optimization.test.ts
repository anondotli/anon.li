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

describe('Performance Benchmark: AdminService.listDomains', () => {
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
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(prisma.domain.findMany as any).mockResolvedValue(domains)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(prisma.domain.count as any).mockResolvedValue(domainCount)

        // Mock groupBy to return counts
        const groupByResult = domains.map(d => ({
            domain: d.domain,
            _count: { domain: Math.floor(Math.random() * 10) }
        }))
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(prisma.alias.groupBy as any).mockResolvedValue(groupByResult)

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

    it('measures execution time with simulated DB latency', async () => {
        const domainCount = 100
        const domains = Array.from({ length: domainCount }, (_, i) => ({
            id: `domain-${i}`,
            domain: `perf-test-${i}.com`,
            verified: true,
            createdAt: new Date(),
            user: { id: `user-${i}`, email: `user-${i}@example.com`, name: `User ${i}` }
        }))

        // Mock with delays
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(prisma.domain.findMany as any).mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 50)) // 50ms for finding domains
            return domains
        })

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(prisma.domain.count as any).mockResolvedValue(domainCount)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        ;(prisma.alias.groupBy as any).mockImplementation(async () => {
            await new Promise(resolve => setTimeout(resolve, 30)) // 30ms for groupBy aggregation
            return domains.map(d => ({
                domain: d.domain,
                _count: { domain: 5 }
            }))
        })

        const start = performance.now()
        await AdminService.listDomains({ limit: domainCount })
        const end = performance.now()

        const duration = end - start
        console.log(`listDomains execution time (simulated): ${duration.toFixed(2)}ms for ${domainCount} domains`)

        // With N+1, it would be roughly 50ms + 100 * (latency for count).
        // With optimization, it is 50ms + 30ms + overhead.
        // Assuming 10ms per count query, unoptimized would be ~1050ms.
        // Optimized should be ~80ms.
        expect(duration).toBeLessThan(500)
    })
})
