import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import crypto from 'crypto'

vi.mock('server-only', () => ({}))

import { NOWPaymentsClient } from '@/lib/nowpayments'

describe('NOWPaymentsClient.verifyIPNSignature', () => {
    const originalEnv = process.env

    beforeEach(() => {
        process.env = { ...originalEnv, NOWPAYMENTS_IPN_SECRET: 'test-secret-key' }
    })

    afterEach(() => {
        process.env = originalEnv
    })

    it('should return true for a valid signature', () => {
        const payload = { payment_id: 123, order_id: 'test_order', payment_status: 'finished' }
        // Compute expected signature: sort keys, JSON.stringify, HMAC-SHA512
        const sorted = { order_id: 'test_order', payment_id: 123, payment_status: 'finished' }
        const hmac = crypto.createHmac('sha512', 'test-secret-key')
        hmac.update(JSON.stringify(sorted))
        const signature = hmac.digest('hex')

        expect(NOWPaymentsClient.verifyIPNSignature(payload, signature)).toBe(true)
    })

    it('should return false for an invalid signature', () => {
        const payload = { payment_id: 123, order_id: 'test_order', payment_status: 'finished' }
        const fakeSignature = crypto.createHmac('sha512', 'wrong-secret').update('{}').digest('hex')

        expect(NOWPaymentsClient.verifyIPNSignature(payload, fakeSignature)).toBe(false)
    })

    it('should return false for a malformed signature', () => {
        const payload = { payment_id: 123 }
        expect(NOWPaymentsClient.verifyIPNSignature(payload, 'not-hex')).toBe(false)
    })

    it('should return false when IPN secret is not configured', () => {
        delete process.env.NOWPAYMENTS_IPN_SECRET
        const payload = { payment_id: 123 }
        expect(NOWPaymentsClient.verifyIPNSignature(payload, 'abc')).toBe(false)
    })

    it('should handle nested objects by sorting recursively', () => {
        const payload = { z_field: 'last', a_field: 'first', nested: { b: 2, a: 1 } }
        // Expected sorted: { a_field: 'first', nested: { a: 1, b: 2 }, z_field: 'last' }
        const sorted = { a_field: 'first', nested: { a: 1, b: 2 }, z_field: 'last' }
        const hmac = crypto.createHmac('sha512', 'test-secret-key')
        hmac.update(JSON.stringify(sorted))
        const signature = hmac.digest('hex')

        expect(NOWPaymentsClient.verifyIPNSignature(payload, signature)).toBe(true)
    })
})
