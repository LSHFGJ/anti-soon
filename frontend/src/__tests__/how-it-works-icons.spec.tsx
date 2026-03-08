import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { HowItWorks } from '../components/HowItWorks'

describe('HowItWorks icon sizing', () => {
  beforeEach(() => {
    vi.stubGlobal('IntersectionObserver', class {
      observe() {}
      unobserve() {}
      disconnect() {}
      takeRecords() { return [] }
    })
  })

  it('uses the same icon container size for all four steps', () => {
    render(<HowItWorks />)

    const icons = screen.getAllByTestId('how-it-works-icon')

    expect(icons).toHaveLength(4)
    for (const icon of icons) {
      expect(icon).toHaveClass('h-12', 'w-12')
    }
  })

  it('uses short, clear copy for each step', () => {
    render(<HowItWorks />)

    for (const copy of [
      'ENCRYPT',
      'Hide your fantastic exploits.',
      'SIMULATE',
      'Run attacks in sandboxes.',
      'CONSENSUS',
      'AI & Human verify on a jury.',
      'PAYOUT',
      'Release bounty NOW.',
    ]) {
      expect(screen.getByText(copy)).toBeInTheDocument()
    }
  })
})
