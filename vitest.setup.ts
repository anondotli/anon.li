import { vi } from 'vitest'

// Prevent server-only from crashing in test environment
vi.mock('server-only', () => ({}))

// Mock @/lib/prisma globally - Bun's runner evaluates lib/prisma.ts before per-file
// mocks can intercept, and Prisma 7 throws PrismaClientConstructorValidationError
// when DATABASE_URL is absent (accelerateUrl: undefined). Per-file mocks override
// this stub with their specific implementations.
vi.mock('@/lib/prisma', () => ({
  prisma: {},
}))

// Mock @/lib/resend globally - Bun's runner tries to statically resolve the .tsx
// file's exports before per-file mocks can intercept, causing SyntaxError.
vi.mock('@/lib/resend', () => ({
  getResendClient: vi.fn(),
  sendWelcomeEmail: vi.fn().mockResolvedValue({ success: true }),
  sendSubscriptionCanceledEmail: vi.fn().mockResolvedValue({ success: true }),
  sendPaymentActionRequiredEmail: vi.fn().mockResolvedValue({ success: true }),
  sendFileExpiringEmail: vi.fn().mockResolvedValue({ success: true }),
  sendDropExpiringEmail: vi.fn().mockResolvedValue({ success: true }),
  sendDownloadLimitReachedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendDomainDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendDomainUnverifiedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendMagicLinkEmail: vi.fn().mockResolvedValue({ success: true }),
  sendEmail: vi.fn().mockResolvedValue({ success: true }),
  sendRecipientVerificationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendDowngradeWarningEmail: vi.fn().mockResolvedValue({ success: true }),
  sendResourcesScheduledForRemovalEmail: vi.fn().mockResolvedValue({ success: true }),
  sendResourcesDeletedEmail: vi.fn().mockResolvedValue({ success: true }),
  sendCryptoPaymentConfirmationEmail: vi.fn().mockResolvedValue({ success: true }),
  sendCryptoRenewalReminderEmail: vi.fn().mockResolvedValue({ success: true }),
}))

// Set Stripe price ID env vars globally so config/plans.ts (which reads them at
// module load time) gets valid values regardless of import order across test files.
process.env.NEXT_PUBLIC_APP_URL ??= 'http://localhost:3000'
process.env.RESEND_API_KEY ??= 're_123456789'
process.env.STRIPE_BUNDLE_PLUS_MONTHLY_PRICE_ID ??= 'price_bundle_plus_monthly'
process.env.STRIPE_BUNDLE_PLUS_YEARLY_PRICE_ID ??= 'price_bundle_plus_yearly'
process.env.STRIPE_BUNDLE_PRO_MONTHLY_PRICE_ID ??= 'price_bundle_pro_monthly'
process.env.STRIPE_BUNDLE_PRO_YEARLY_PRICE_ID ??= 'price_bundle_pro_yearly'
process.env.STRIPE_ALIAS_PLUS_MONTHLY_PRICE_ID ??= 'price_alias_plus_monthly'
process.env.STRIPE_ALIAS_PLUS_YEARLY_PRICE_ID ??= 'price_alias_plus_yearly'
process.env.STRIPE_ALIAS_PRO_MONTHLY_PRICE_ID ??= 'price_alias_pro_monthly'
process.env.STRIPE_ALIAS_PRO_YEARLY_PRICE_ID ??= 'price_alias_pro_yearly'
process.env.STRIPE_DROP_PLUS_MONTHLY_PRICE_ID ??= 'price_drop_plus_monthly'
process.env.STRIPE_DROP_PLUS_YEARLY_PRICE_ID ??= 'price_drop_plus_yearly'
process.env.STRIPE_DROP_PRO_MONTHLY_PRICE_ID ??= 'price_drop_pro_monthly'
process.env.STRIPE_DROP_PRO_YEARLY_PRICE_ID ??= 'price_drop_pro_yearly'

// Mock matchMedia
if (typeof window !== 'undefined') {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: vi.fn().mockImplementation(query => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(), // deprecated
      removeListener: vi.fn(), // deprecated
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  })
}

// Mock ResizeObserver
if (typeof global !== 'undefined') {
  global.ResizeObserver = vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  }))
}
