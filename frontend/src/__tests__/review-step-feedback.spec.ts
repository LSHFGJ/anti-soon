import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewStep } from '../components/PoCBuilder/Steps/ReviewStep'

const mockUseCommitReveal = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()
const mockToastWarning = vi.fn()
const mockToastInfo = vi.fn()

vi.mock('../hooks/useCommitReveal', () => ({
  useCommitReveal: (...args: unknown[]) => mockUseCommitReveal(...args)
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args),
    warning: (...args: unknown[]) => mockToastWarning(...args),
    info: (...args: unknown[]) => mockToastInfo(...args),
  })
}))

const baseCommitReveal = {
  state: { phase: 'idle' as const },
  commit: vi.fn(),
  reveal: vi.fn(),
  reset: vi.fn(),
  isConnected: true
}

const baseProps: React.ComponentProps<typeof ReviewStep> = {
  pocJson: '{"target":"0x123"}',
  isConnected: true,
  isSubmitting: false,
  submissionHash: '',
  error: null,
  onConnect: vi.fn(),
  onSubmit: vi.fn(),
  onBack: vi.fn(),
  projectId: 1n,
  useV2: true
}

function renderReviewStep(overrides: Partial<typeof baseProps> = {}) {
  return render(
    React.createElement(ReviewStep, {
      ...baseProps,
      ...overrides
    })
  )
}

describe('ReviewStep feedback reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCommitReveal.mockReturnValue({
      ...baseCommitReveal,
      state: { phase: 'idle' }
    })
  })

  it('renders revealed-state verification action without inline messaging', () => {
    mockUseCommitReveal.mockReturnValue({
      ...baseCommitReveal,
      state: {
        phase: 'revealed',
        submissionId: 9n,
        commitTxHash: '0xabc'
      }
    })

    renderReviewStep()

    expect(screen.getByRole('link', { name: '[ VIEW_VERIFICATION_STATUS ]' })).toBeVisible()
    expect(screen.queryByText(/CRE verification is now in progress/i)).not.toBeInTheDocument()
  })

  it('emits success toasts only on phase transitions without duplicates', () => {
    let phaseState: Record<string, unknown> = {
      phase: 'idle'
    }

    mockUseCommitReveal.mockImplementation(() => ({
      ...baseCommitReveal,
      state: phaseState
    }))

    const view = renderReviewStep()
    expect(mockToastSuccess).toHaveBeenCalledTimes(0)

    phaseState = {
      phase: 'committed',
      submissionId: 11n,
      commitTxHash: '0x01'
    }

    view.rerender(
      React.createElement(ReviewStep, {
        pocJson: '{"target":"0x123"}',
        isConnected: true,
        isSubmitting: false,
        submissionHash: '',
        error: null,
        onConnect: vi.fn(),
        onSubmit: vi.fn(),
        onBack: vi.fn(),
        projectId: 1n,
        useV2: true
      })
    )

    expect(mockToastSuccess).toHaveBeenCalledTimes(1)
    expect(mockToastSuccess).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'PoC Committed' })
    )

    expect(mockToastSuccess).toHaveBeenCalledTimes(1)

    phaseState = {
      phase: 'revealed',
      submissionId: 11n,
      commitTxHash: '0x01',
      revealTxHash: '0x02'
    }

    view.rerender(
      React.createElement(ReviewStep, {
        pocJson: '{"target":"0x123"}',
        isConnected: true,
        isSubmitting: false,
        submissionHash: '',
        error: null,
        onConnect: vi.fn(),
        onSubmit: vi.fn(),
        onBack: vi.fn(),
        projectId: 1n,
        useV2: true
      })
    )

    expect(mockToastSuccess).toHaveBeenCalledTimes(2)
    expect(mockToastSuccess).toHaveBeenLastCalledWith(
      expect.objectContaining({ title: 'PoC Revealed' })
    )
  })

  it('keeps failed-state retry and reset actions clickable without inline error banners', () => {
    const reveal = vi.fn()
    const reset = vi.fn()

    mockUseCommitReveal.mockReturnValue({
      ...baseCommitReveal,
      reveal,
      reset,
      state: {
        phase: 'failed',
        error: 'Reveal failed: rpc timeout',
        submissionId: 12n,
        salt: '0x1234'
      }
    })

    renderReviewStep()

    expect(screen.queryByText('ERROR:')).not.toBeInTheDocument()
    expect(screen.queryByText(/Reveal failed: rpc timeout/i)).not.toBeInTheDocument()
    expect(mockToastError).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'Transaction Failed',
        description: 'Reveal failed: rpc timeout',
      }),
    )

    fireEvent.click(screen.getByRole('button', { name: '[ RETRY ]' }))
    expect(reveal).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '[ RESET ]' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('shows actionable project-context CTAs when project is missing', () => {
    renderReviewStep({ projectId: null })

    const commitButton = screen.getByRole('button', { name: '[ COMMIT ]' })
    expect(commitButton).toBeEnabled()
    fireEvent.click(commitButton)

    expect(mockToastWarning).toHaveBeenCalledWith(
      expect.objectContaining({
        title: 'PROJECT_CONTEXT_REQUIRED',
        action: expect.objectContaining({ label: '[ OPEN_EXPLORER ]' }),
        cancel: expect.objectContaining({ label: '[ RETRY_CONTEXT ]' }),
      }),
    )
  })

  it('shows commit CTA when wallet is connected and project context exists', () => {
    renderReviewStep({ isConnected: true, projectId: 1n })

    expect(screen.getByRole('button', { name: '[ COMMIT ]' })).toBeVisible()
  })

  it('keeps commit CTA clickable before wallet connect and prompts connect on click', () => {
    const onConnect = vi.fn()
    renderReviewStep({ isConnected: false, projectId: 1n, onConnect })

    expect(screen.queryByRole('button', { name: '[ CONNECT_WALLET ]' })).not.toBeInTheDocument()

    const commitButton = screen.getByRole('button', { name: '[ COMMIT ]' })
    expect(commitButton).toBeEnabled()
    fireEvent.click(commitButton)
    expect(onConnect).toHaveBeenCalledTimes(1)
  })

  it('renders primary action on the same row as previous in review footer', () => {
    renderReviewStep({ isConnected: true, projectId: 1n })

    const actionRow = screen.getByTestId('review-action-row')
    expect(within(actionRow).getByRole('button', { name: '[ PREVIOUS ]' })).toBeVisible()
    expect(within(actionRow).getByRole('button', { name: '[ COMMIT ]' })).toBeVisible()
  })
})
