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
  updateAliasEncryptedMetadataAction: vi.fn(),
}))

vi.mock('@/components/vault/vault-provider', () => ({
  useVault: () => ({
    status: 'unlocked',
    getVaultKey: () => ({}),
  }),
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
    encryptedLabel: null,
    encryptedNote: null,
    legacyLabel: null,
    legacyNote: null,
    emailsReceived: 10,
    emailsBlocked: 2,
    createdAt: new Date(),
    lastEmailAt: new Date(),
  }

  const mockMetadata = {
    label: null,
    note: null,
    labelStatus: 'empty' as const,
    noteStatus: 'empty' as const,
  }

  it('renders alias information correctly', async () => {
    if (skipInBun) {
      // Skip test in Bun - requires jsdom
      expect(true).toBe(true)
      return
    }

    const { render, screen } = await import('@testing-library/react')
    const { AliasItem } = await import('@/components/alias')

    render(<AliasItem alias={mockAlias} metadata={mockMetadata} />)

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

    render(<AliasItem alias={mockAlias} metadata={mockMetadata} />)

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

    render(<AliasItem alias={mockAlias} metadata={mockMetadata} />)

    const optionsButtons = screen.getAllByLabelText('Alias options')
    expect(optionsButtons.length).toBeGreaterThan(0)
  })

  it('has a details toggle that opens and closes the panel', async () => {
    const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
    const { AliasItem } = await import('@/components/alias')
    cleanup()

    render(<AliasItem alias={mockAlias} metadata={mockMetadata} />)

    const expand = screen.getByRole('button', { name: 'Expand alias details' })
    expect(expand.getAttribute('aria-expanded')).toBe('false')
    fireEvent.click(expand)

    const collapse = screen.getByRole('button', { name: 'Collapse alias details' })
    expect(collapse.getAttribute('aria-expanded')).toBe('true')
    expect(screen.getByText('Forwarding to')).toBeDefined()
    fireEvent.click(collapse)
    expect(screen.getByRole('button', { name: 'Expand alias details' })).toBeDefined()
  })

  it('shows the taken-down state and locks the toggle', async () => {
    const { render, screen, cleanup } = await import('@testing-library/react')
    const { AliasItem } = await import('@/components/alias')
    cleanup()

    render(<AliasItem alias={{ ...mockAlias, active: false, takenDownAt: new Date() }} metadata={mockMetadata} />)

    expect(screen.getByText('Disabled by anon.li')).toBeDefined()
    expect(screen.getByText(/violating our terms of service/)).toBeDefined()
    for (const toggle of screen.getAllByLabelText('Activate alias')) {
      expect(toggle.hasAttribute('disabled')).toBe(true)
    }
  })

  it('hides forwarding controls from team members who cannot change them', async () => {
    const { render, screen, fireEvent, cleanup } = await import('@testing-library/react')
    const { AliasItem } = await import('@/components/alias')
    cleanup()

    const recipients = [
      { id: 'recipient_123', email: 'user@example.com', verified: true, isDefault: true, pgpPublicKey: null },
      { id: 'recipient_456', email: 'second@example.com', verified: true, isDefault: false, pgpPublicKey: null },
    ]
    render(<AliasItem alias={mockAlias} metadata={mockMetadata} recipients={recipients} canManage={false} />)

    fireEvent.click(screen.getByRole('button', { name: 'Expand alias details' }))
    expect(screen.queryByRole('button', { name: 'Change' })).toBeNull()
    expect(screen.getByText('Only team admins can change where this alias forwards.')).toBeDefined()
  })

  it('shows every forwarding recipient and preserves them when editing', async () => {
    const { render, screen, fireEvent, waitFor, cleanup } = await import('@testing-library/react')
    const { AliasItem } = await import('@/components/alias')
    cleanup()
    const { updateAliasAction } = await import('@/actions/alias')
    ;(updateAliasAction as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true })

    const recipients = [
      { id: 'recipient_123', email: 'user@example.com', verified: true, isDefault: true, pgpPublicKey: null },
      { id: 'recipient_456', email: 'second@example.com', verified: true, isDefault: false, pgpPublicKey: null },
      { id: 'recipient_789', email: 'third@example.com', verified: true, isDefault: false, pgpPublicKey: null },
    ]
    const alias = {
      ...mockAlias,
      aliasRecipients: [
        { isPrimary: true, recipient: { id: 'recipient_123', email: 'user@example.com', pgpPublicKey: null } },
        { isPrimary: false, recipient: { id: 'recipient_456', email: 'second@example.com', pgpPublicKey: null } },
      ],
    }

    render(<AliasItem alias={alias} metadata={mockMetadata} recipients={recipients} />)

    // Main row indicates the extra recipient.
    expect(screen.getByText('+1')).toBeDefined()

    fireEvent.click(screen.getByRole('button', { name: 'Expand alias details' }))
    expect(screen.getAllByText('second@example.com').length).toBeGreaterThan(0)

    fireEvent.click(screen.getByRole('button', { name: 'Change' }))
    const third = screen.getByRole('checkbox', { name: /third@example.com/ })
    fireEvent.click(third)
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => {
      expect(updateAliasAction).toHaveBeenCalledWith('alias_123', {
        recipientIds: ['recipient_123', 'recipient_456', 'recipient_789'],
      })
    })
  })
})
