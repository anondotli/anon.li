/**
 * v1 API input handling:
 * - PATCH /alias/:id `active` is an idempotent set passed through updateAlias
 *   (applied with any recipient change), never a read-then-toggle;
 * - alias lookups by email are case-insensitive;
 * - POST /domain lowercases before validating, so "Example.COM" is accepted.
 */
import { describe, it, expect, vi, beforeEach, Mock } from 'vitest'
import { PATCH } from '@/app/api/v1/alias/[id]/route'
import { POST as createDomain } from '@/app/api/v1/domain/route'
import { resolveAlias } from '@/app/api/v1/alias/_utils'
import { AliasService } from '@/lib/services/alias'
import { DomainService } from '@/lib/services/domain'
import { validateApiKey, hasExplicitApiKey } from '@/lib/api-auth'
import { getAliasByEmail, getAliasById } from '@/lib/data/alias'
import { personalScope } from '@/lib/ownership'

vi.mock('@/lib/services/alias', () => ({
  AliasService: {
    updateAlias: vi.fn(),
    toggleAlias: vi.fn(),
  },
}))

vi.mock('@/lib/services/domain', () => ({
  DomainService: { createDomain: vi.fn() },
}))

vi.mock('@/lib/data/alias', () => ({
  getAliasById: vi.fn(),
  getAliasByEmail: vi.fn(),
}))

vi.mock('@/lib/api-auth', () => ({
  validateApiKey: vi.fn(),
  hasExplicitApiKey: vi.fn(),
}))

// No session: keep the real better-auth instance (and its OAuth resource
// seeding against the database) out of this test.
vi.mock("@/auth", () => ({ auth: vi.fn().mockResolvedValue(null) }))

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: vi.fn().mockResolvedValue({ banFileUpload: false, banAliasCreation: false }),
    },
  },
}))

vi.mock('@/lib/api-rate-limit', () => ({
  createRateLimitHeaders: () => new Headers(),
}))

vi.mock('@/lib/rate-limit', () => ({
  rateLimit: vi.fn().mockResolvedValue(null),
  rateLimiters: {},
  getClientIp: vi.fn().mockResolvedValue('127.0.0.1'),
}))

const aliasRow = {
  id: 'alias1',
  email: 'shop@anon.li',
  active: true,
  encryptedLabel: null,
  encryptedNote: null,
  createdAt: new Date('2026-04-15T00:00:00.000Z'),
  updatedAt: new Date('2026-04-15T00:00:00.000Z'),
  userId: 'user1',
  organizationId: null,
}

describe('v1 alias/domain input handling', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    ;(validateApiKey as unknown as Mock).mockResolvedValue({
      user: { id: 'user1', email: 'test@example.com' },
      rateLimit: { success: true, reset: new Date(), limit: 10, remaining: 9 },
      apiKeyId: 'key1',
    })
    ;(hasExplicitApiKey as unknown as Mock).mockReturnValue(false)
    ;(getAliasById as unknown as Mock).mockResolvedValue(aliasRow)
  })

  it('PATCH active sets the value through updateAlias instead of toggling', async () => {
    const req = new Request('http://localhost/api/v1/alias/alias1', {
      method: 'PATCH',
      body: JSON.stringify({ active: true, recipient_ids: ['rec-a'] }),
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'alias1' }) })

    expect(res.status).toBe(200)
    expect(AliasService.toggleAlias).not.toHaveBeenCalled()
    // Even when `active` already matches, the set is sent (idempotent) together
    // with the recipient change, so both commit atomically after validation.
    expect(AliasService.updateAlias).toHaveBeenCalledWith(personalScope('user1'), 'alias1', {
      active: true,
      recipientIds: ['rec-a'],
    })
  })

  it('does not change active when updateAlias rejects', async () => {
    ;(AliasService.updateAlias as unknown as Mock).mockRejectedValueOnce(
      Object.assign(new Error('Recipient not found'), { name: 'NotFoundError' }),
    )
    const req = new Request('http://localhost/api/v1/alias/alias1', {
      method: 'PATCH',
      body: JSON.stringify({ active: false, recipient_ids: ['missing'] }),
    })

    await PATCH(req, { params: Promise.resolve({ id: 'alias1' }) })

    expect(AliasService.toggleAlias).not.toHaveBeenCalled()
  })

  it('passes org_key_generation through and surfaces a stale-generation 409 with its code', async () => {
    const { ConflictError } = await import('@/lib/api-error-utils')
    ;(AliasService.updateAlias as unknown as Mock).mockRejectedValueOnce(
      new ConflictError('Team encryption key changed — please retry', 'ORG_KEY_GENERATION_MISMATCH'),
    )
    const encryptedLabel = JSON.stringify({ v: 1, alg: 'AES-256-GCM', iv: 'abcdefghijklmnop', ct: 'ciphertext' })
    const req = new Request('http://localhost/api/v1/alias/alias1', {
      method: 'PATCH',
      body: JSON.stringify({ encrypted_label: encryptedLabel, org_key_generation: 2 }),
    })

    const res = await PATCH(req, { params: Promise.resolve({ id: 'alias1' }) })

    expect(AliasService.updateAlias).toHaveBeenCalledWith(personalScope('user1'), 'alias1', {
      encryptedLabel,
      clearLegacyLabel: true,
      orgKeyGeneration: 2,
    })
    expect(res.status).toBe(409)
    const body = await res.json()
    expect(body.error.code).toBe('ORG_KEY_GENERATION_MISMATCH')
  })

  it('resolves aliases by email case-insensitively', async () => {
    ;(getAliasByEmail as unknown as Mock).mockResolvedValue(aliasRow)

    const alias = await resolveAlias('Shop@Anon.LI', personalScope('user1'))

    expect(getAliasByEmail).toHaveBeenCalledWith('shop@anon.li')
    expect(alias).toMatchObject({ id: 'alias1' })
  })

  it('POST /domain accepts mixed-case input and lowercases it', async () => {
    ;(DomainService.createDomain as unknown as Mock).mockResolvedValue({
      id: 'd1',
      domain: 'example.com',
      verified: false,
      ownershipVerified: false,
      mxVerified: false,
      spfVerified: false,
      dkimVerified: false,
      verificationToken: 'tok',
      dkimPublicKey: null,
      dkimSelector: 'default',
      createdAt: new Date(),
    })
    const req = new Request('http://localhost/api/v1/domain', {
      method: 'POST',
      body: JSON.stringify({ domain: ' Example.COM ' }),
    })

    const res = await createDomain(req)

    expect(res.status).toBe(201)
    expect(DomainService.createDomain).toHaveBeenCalledWith(personalScope('user1'), 'example.com')
  })
})
