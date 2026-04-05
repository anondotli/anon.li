/**
 * Tests for the internal health check API endpoint.
 *
 * @vitest-environment node
 */

import { describe, it, expect, vi, beforeEach, type Mock } from 'vitest'
import { GET } from './route'
import { prisma } from '@/lib/prisma'

// Mock prisma
vi.mock('@/lib/prisma', () => ({
    prisma: {
        $queryRaw: vi.fn(),
    },
}))

const mockQueryRaw = prisma.$queryRaw as Mock

describe('/api/internal/health', () => {
    beforeEach(() => {
        vi.resetAllMocks()
    })

    it('returns 200 OK when database is reachable', async () => {
        mockQueryRaw.mockResolvedValue([{ 1: 1 }])

        const response = await GET()
        const json = await response.json()

        expect(response.status).toBe(200)
        expect(json.status).toBe('ok')
        expect(json.service).toBe('anon.li-api')
    })

    it('returns 503 when database is unreachable', async () => {
        const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
        mockQueryRaw.mockRejectedValue(new Error('Connection failed'))

        const response = await GET()
        const json = await response.json()

        expect(response.status).toBe(503)
        expect(json.status).toBe('error')
        expect(json.error).toBe('Database connection failed')

        consoleSpy.mockRestore()
    })
})
