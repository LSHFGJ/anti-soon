import React from 'react'
import { fireEvent, render, screen } from '@testing-library/react'
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

function renderReviewStep() {
  return render(
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
}

describe('ReviewStep feedback reliability', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockUseCommitReveal.mockReturnValue({
      ...baseCommitReveal,
      state: { phase: 'idle' }
    })
  })

  it('renders explicit COMMIT -> REVEAL -> VERIFYING sequence on revealed state', () => {
    mockUseCommitReveal.mockReturnValue({
      ...baseCommitReveal,
      state: {
        phase: 'revealed',
        submissionId: 9n,
        commitTxHash: '0xabc'
      }
    })

    renderReviewStep()

    expect(screen.getByText('1. COMMIT')).toBeInTheDocument()
    expect(screen.getByText('2. REVEAL')).toBeInTheDocument()
    expect(screen.getByText('3. VERIFYING')).toBeInTheDocument()
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
})
