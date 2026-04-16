import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { POST } from '@/app/api/v1/alias/route'
import { PATCH } from '@/app/api/v1/alias/[id]/route'
import { AliasService } from '@/lib/services/alias'
import { validateApiKey, hasExplicitApiKey } from '@/lib/api-auth'
import { getAliasById } from '@/lib/data/alias'

// Mock dependencies
vi.mock('@/lib/services/alias', () => ({
  AliasService: {
    createAlias: vi.fn(),
    getAliases: vi.fn(),
    updateAlias: vi.fn(),
    toggleAlias: vi.fn()
  }
}))

vi.mock('@/lib/data/alias', () => ({
  getAliasById: vi.fn(),
  getAliasByEmail: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  validateApiKey: vi.fn(),
  hasExplicitApiKey: vi.fn()
}))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({
        banFileUpload: false,
        banAliasCreation: false,
      }),
    },
  }
}))

vi.mock('@/lib/api-rate-limit', () => ({
    createRateLimitHeaders: () => new Headers(),
}))

describe('POST /api/v1/alias Validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock successful auth
    ;(validateApiKey as unknown as Mock).mockResolvedValue({
      user: { id: 'user1', email: 'test@example.com' },
      rateLimit: { success: true, reset: new Date(), limit: 10, remaining: 9 },
      apiKeyId: 'key1'
    });
    ;(hasExplicitApiKey as unknown as Mock).mockReturnValue(false)

    // Mock successful service call
    ;(AliasService.createAlias as unknown as Mock).mockResolvedValue({
      id: 'alias1',
      email: 'test@anon.li',
      active: true,
      encryptedLabel: null,
      encryptedNote: null,
      legacyLabel: null,
      legacyNote: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      localPart: 'test',
      domain: 'anon.li',
      format: 'CUSTOM',
      userId: 'user1',
      recipientId: 'rec1',
      emailsReceived: 0,
      emailsBlocked: 0,
      lastEmailAt: null,
      scheduledForRemovalAt: null
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } as any)
  })

  it('should reject extremely long description', async () => {
    const longDesc = 'a'.repeat(256)
    const req = new Request('http://localhost/api/v1/alias', {
        method: 'POST',
        body: JSON.stringify({
            description: longDesc
        })
    })

    const res = await POST(req)
    // currently should succeed because no validation
    // expect(res.status).toBe(201)
    expect(res.status).toBe(400)
  })

  it('should reject extremely long local_part', async () => {
      const longLocalPart = 'a'.repeat(100)
      const req = new Request('http://localhost/api/v1/alias', {
        method: 'POST',
        body: JSON.stringify({
          format: 'custom',
          local_part: longLocalPart,
          domain: 'anon.li'
        })
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
  })

  it('should reject massive recipient_ids array', async () => {
      const hugeArray = Array(51).fill('id_123')
      const req = new Request('http://localhost/api/v1/alias', {
        method: 'POST',
        body: JSON.stringify({
            recipient_ids: hugeArray
        })
      })

      const res = await POST(req)
      expect(res.status).toBe(400)
  })

  it('should reject plaintext metadata updates', async () => {
      ;(getAliasById as unknown as Mock).mockResolvedValue({
        id: 'alias1',
        email: 'test@anon.li',
        active: true,
        encryptedLabel: null,
        encryptedNote: null,
        createdAt: new Date('2026-04-15T00:00:00.000Z'),
        updatedAt: new Date('2026-04-15T00:00:00.000Z'),
        userId: 'user1',
      })

      const req = new Request('http://localhost/api/v1/alias/alias1', {
        method: 'PATCH',
        body: JSON.stringify({ label: 'Shopping' })
      })

      const res = await PATCH(req, { params: Promise.resolve({ id: 'alias1' }) })
      expect(res.status).toBe(400)
      expect(AliasService.updateAlias).not.toHaveBeenCalled()
  })

  it('should accept encrypted metadata updates', async () => {
      const encryptedLabel = JSON.stringify({
        v: 1,
        alg: 'AES-256-GCM',
        iv: 'abcdefghijklmnop',
        ct: 'ciphertext',
      })
      ;(getAliasById as unknown as Mock).mockResolvedValue({
        id: 'alias1',
        email: 'test@anon.li',
        active: true,
        encryptedLabel,
        encryptedNote: null,
        createdAt: new Date('2026-04-15T00:00:00.000Z'),
        updatedAt: new Date('2026-04-15T00:00:00.000Z'),
        userId: 'user1',
      })

      const req = new Request('http://localhost/api/v1/alias/alias1', {
        method: 'PATCH',
        body: JSON.stringify({ encrypted_label: encryptedLabel })
      })

      const res = await PATCH(req, { params: Promise.resolve({ id: 'alias1' }) })
      expect(res.status).toBe(200)
      expect(AliasService.updateAlias).toHaveBeenCalledWith('user1', 'alias1', {
        encryptedLabel,
        clearLegacyLabel: true,
      })
  })
})
