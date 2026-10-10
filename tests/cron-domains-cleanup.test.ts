/**
 * @vitest-environment node
 *
 * Stale custom-domain cleanup: only never-verified claims are removed after
 * 24h; revoked (previously verified) domains get a real grace period; a deleted
 * domain's aliases are removed in the same transaction, scoped to its owner;
 * notification failures reported as `{ success: false }` count as errors.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest'

const { domainFindMany, txDomainDeleteMany, txAliasDeleteMany, transaction, sendDomainDeletedEmail, getOrgAdminEmails } = vi.hoisted(() => {
    const txDomainDeleteMany = vi.fn()
    const txAliasDeleteMany = vi.fn()
    const tx = {
        domain: { deleteMany: txDomainDeleteMany },
        alias: { deleteMany: txAliasDeleteMany },
    }
    return {
        domainFindMany: vi.fn(),
        txDomainDeleteMany,
        txAliasDeleteMany,
        transaction: vi.fn(async (fn: (client: typeof tx) => Promise<unknown>) => fn(tx)),
        sendDomainDeletedEmail: vi.fn(),
        getOrgAdminEmails: vi.fn(),
    }
})

vi.mock('@/lib/prisma', () => ({
    prisma: {
        domain: { findMany: domainFindMany },
        $transaction: transaction,
    },
}))

vi.mock('@/lib/resend', () => ({
    sendDomainDeletedEmail,
    sendDomainUnverifiedEmail: vi.fn(),
}))

vi.mock('@/lib/data/organization', () => ({ getOrgAdminEmails }))

import { cleanupStaleDomains, REVOKED_DOMAIN_GRACE_DAYS } from '@/lib/services/cron-domains'

const DAY_MS = 24 * 60 * 60 * 1000

function staleDomain(i: number, overrides: Record<string, unknown> = {}) {
    return {
        id: `domain-${i}`,
        domain: `test-${i}.com`,
        verified: false,
        unverifiedAt: null,
        userId: `user-${i}`,
        organizationId: null,
        createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000),
        user: { email: `user-${i}@example.com` },
        ...overrides,
    }
}

describe('cleanupStaleDomains', () => {
    beforeEach(() => {
        vi.clearAllMocks()
        txDomainDeleteMany.mockResolvedValue({ count: 1 })
        txAliasDeleteMany.mockResolvedValue({ count: 0 })
        sendDomainDeletedEmail.mockResolvedValue({ success: true, data: {} })
        getOrgAdminEmails.mockResolvedValue([])
    })

    it('only selects never-verified claims after 24h and revoked domains after the grace period', async () => {
        domainFindMany.mockResolvedValue([])
        const before = Date.now()

        await cleanupStaleDomains()

        const where = domainFindMany.mock.calls[0]![0].where
        expect(where.verified).toBe(false)
        expect(where.OR).toHaveLength(2)

        const [neverVerified, revoked] = where.OR
        // Never-verified: no revocation timestamp, created > 24h ago.
        expect(neverVerified.unverifiedAt).toBeNull()
        expect(before - neverVerified.createdAt.lt.getTime()).toBeGreaterThanOrEqual(DAY_MS - 1000)
        expect(before - neverVerified.createdAt.lt.getTime()).toBeLessThan(DAY_MS + 1000)
        // Revoked: only after the full grace period — a domain revoked by the
        // re-verification cron must NOT match on its (old) createdAt.
        expect(revoked.createdAt).toBeUndefined()
        const graceMs = REVOKED_DOMAIN_GRACE_DAYS * DAY_MS
        expect(before - revoked.unverifiedAt.lt.getTime()).toBeGreaterThanOrEqual(graceMs - 1000)
        expect(REVOKED_DOMAIN_GRACE_DAYS).toBeGreaterThan(1)
    })

    it('deletes each domain with its owner-scoped aliases and notifies every owner', async () => {
        const domains = Array.from({ length: 5 }, (_, i) => staleDomain(i))
        domainFindMany.mockResolvedValue(domains)

        const results = await cleanupStaleDomains()

        expect(results).toEqual({ deleted: 5, errors: 0 })
        expect(transaction).toHaveBeenCalledTimes(5)
        expect(txDomainDeleteMany).toHaveBeenCalledWith({ where: { id: 'domain-0', verified: false } })
        expect(txAliasDeleteMany).toHaveBeenCalledWith({
            where: { domain: 'test-0.com', userId: 'user-0', organizationId: null },
        })
        expect(sendDomainDeletedEmail).toHaveBeenCalledTimes(5)
    })

    it('scopes alias deletion to the org for org-owned domains', async () => {
        domainFindMany.mockResolvedValue([staleDomain(1, { organizationId: 'org-1', userId: 'member-1' })])
        getOrgAdminEmails.mockResolvedValue(['admin@example.com'])

        await cleanupStaleDomains()

        expect(txAliasDeleteMany).toHaveBeenCalledWith({
            where: { domain: 'test-1.com', organizationId: 'org-1' },
        })
        expect(sendDomainDeletedEmail).toHaveBeenCalledWith('admin@example.com', 'test-1.com')
    })

    it('skips alias deletion and notification when the domain was re-verified meanwhile', async () => {
        domainFindMany.mockResolvedValue([staleDomain(1)])
        txDomainDeleteMany.mockResolvedValue({ count: 0 })

        const results = await cleanupStaleDomains()

        expect(results).toEqual({ deleted: 0, errors: 0 })
        expect(txAliasDeleteMany).not.toHaveBeenCalled()
        expect(sendDomainDeletedEmail).not.toHaveBeenCalled()
    })

    it('counts a failed per-domain transaction as an error and continues', async () => {
        domainFindMany.mockResolvedValue([staleDomain(1), staleDomain(2)])
        transaction.mockRejectedValueOnce(new Error('db down'))

        const results = await cleanupStaleDomains()

        expect(results).toEqual({ deleted: 1, errors: 1 })
        expect(sendDomainDeletedEmail).toHaveBeenCalledTimes(1)
        expect(sendDomainDeletedEmail).toHaveBeenCalledWith('user-2@example.com', 'test-2.com')
    })

    it('counts `{ success: false }` sends as notification errors', async () => {
        domainFindMany.mockResolvedValue([staleDomain(1)])
        sendDomainDeletedEmail.mockResolvedValue({ success: false, error: new Error('rate limited') })

        const results = await cleanupStaleDomains()

        expect(results).toEqual({ deleted: 1, errors: 1 })
    })
})
