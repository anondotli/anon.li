/**
 * @vitest-environment jsdom
 *
 * Note: These tests require jsdom environment and are designed to run with Vitest.
 * When running with `bun test`, these tests will be skipped.
 * Use `bun run test` to run with Vitest which properly handles jsdom.
 */
import { describe, it, expect, vi } from 'vitest'

// Skip tests if running in Bun without DOM environment
const skipInBun = typeof document === 'undefined'

// Mock Next.js navigation
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    prefetch: vi.fn(),
  }),
  usePathname: () => '/dashboard/alias',
  useSearchParams: () => new URLSearchParams(),
}))

// Mock the server actions
vi.mock('@/actions/alias', () => ({
  toggleAliasAction: vi.fn(),
  deleteAliasAction: vi.fn(),
  updateAliasAction: vi.fn(),
}))

describe('AliasItem', () => {
  const mockAlias = {
    id: 'alias_123',
    email: 'test@anon.li',
    recipientId: 'recipient_123',
    recipient: {
      id: 'recipient_123',
      email: 'user@example.com',
      pgpPublicKey: null,
    },
    active: true,
    emailsReceived: 10,
    emailsBlocked: 2,
    createdAt: new Date(),
    lastEmailAt: new Date(),
  }

  it('renders alias information correctly', async () => {
    if (skipInBun) {
      // Skip test in Bun - requires jsdom
      expect(true).toBe(true)
      return
    }

    const { render, screen } = await import('@testing-library/react')
    const { AliasItem } = await import('@/components/alias')

    render(<AliasItem alias={mockAlias} />)

    expect(screen.getByText('test@anon.li')).toBeDefined()
    expect(screen.getByText('Active')).toBeDefined()
  })

  it('has accessible buttons', async () => {
    if (skipInBun) {
      expect(true).toBe(true)
      return
    }

    const { render, screen } = await import('@testing-library/react')
    const { AliasItem } = await import('@/components/alias')

    render(<AliasItem alias={mockAlias} />)

    const copyButtons = screen.getAllByLabelText(`Copy ${mockAlias.email}`)
    expect(copyButtons.length).toBeGreaterThan(0)

    const toggleSwitches = screen.getAllByLabelText('Pause alias')
    expect(toggleSwitches.length).toBeGreaterThan(0)
  })

  it('should have aria-labels for icon-only buttons', async () => {
    if (skipInBun) {
      expect(true).toBe(true)
      return
    }

    const { render, screen } = await import('@testing-library/react')
    const { AliasItem } = await import('@/components/alias')

    render(<AliasItem alias={mockAlias} />)

    const optionsButtons = screen.getAllByLabelText('Alias options')
    expect(optionsButtons.length).toBeGreaterThan(0)
  })
})
