import React from 'react'
import { fireEvent, render, screen, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ReviewStep } from '../components/PoCBuilder/Steps/ReviewStep'

const mockUseCommitReveal = vi.fn()
const mockToastSuccess = vi.fn()
const mockToastError = vi.fn()

vi.mock('../hooks/useCommitReveal', () => ({
  useCommitReveal: (...args: unknown[]) => mockUseCommitReveal(...args)
}))

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({
    success: (...args: unknown[]) => mockToastSuccess(...args),
    error: (...args: unknown[]) => mockToastError(...args)
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

  it('renders revealed-state verification messaging', () => {
    mockUseCommitReveal.mockReturnValue({
      ...baseCommitReveal,
      state: {
        phase: 'revealed',
        submissionId: 9n,
        commitTxHash: '0xabc'
      }
    })

    renderReviewStep()

    expect(screen.getByText(/CRE verification is now in progress/i)).toBeInTheDocument()
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

  it('shows recoverable failure with deterministic retry and reset actions', () => {
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

    expect(screen.getByText('ERROR:')).toBeInTheDocument()
    expect(screen.getByText(/Reveal failed: rpc timeout/i)).toBeInTheDocument()

    fireEvent.click(screen.getByRole('button', { name: '[ RETRY_REVEAL ]' }))
    expect(reveal).toHaveBeenCalledTimes(1)

    fireEvent.click(screen.getByRole('button', { name: '[ RESET ]' }))
    expect(reset).toHaveBeenCalledTimes(1)
  })

  it('shows actionable project-context CTAs when project is missing', () => {
    renderReviewStep({ projectId: null })

    expect(screen.getByRole('button', { name: '[ COMMIT_POC_REFERENCE ]' })).toBeDisabled()
    expect(screen.getByTestId('review-project-context-required')).toBeInTheDocument()
    expect(screen.getByText('PROJECT_CONTEXT_REQUIRED')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: '[ OPEN_EXPLORER ]' })).toHaveAttribute('href', '/explorer')
    expect(screen.getByRole('link', { name: '[ RETRY_CONTEXT ]' })).toHaveAttribute('href', '/builder')
  })

  it('shows commit CTA when wallet is connected and project context exists', () => {
    renderReviewStep({ isConnected: true, projectId: 1n })

    expect(screen.getByRole('button', { name: '[ COMMIT_POC_REFERENCE ]' })).toBeVisible()
  })

  it('keeps commit CTA visible but disabled before wallet connect', () => {
    renderReviewStep({ isConnected: false, projectId: 1n })

    expect(screen.getByRole('button', { name: '[ COMMIT_POC_REFERENCE ]' })).toBeDisabled()
    expect(screen.getByRole('button', { name: '[ CONNECT_WALLET ]' })).toBeVisible()
  })

  it('renders primary action on the same row as previous in review footer', () => {
    renderReviewStep({ isConnected: true, projectId: 1n })

    const actionRow = screen.getByTestId('review-action-row')
    expect(within(actionRow).getByRole('button', { name: '[ PREVIOUS ]' })).toBeVisible()
    expect(within(actionRow).getByRole('button', { name: '[ COMMIT_POC_REFERENCE ]' })).toBeVisible()
  })
})
