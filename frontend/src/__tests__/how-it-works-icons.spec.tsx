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

    expect(screen.getByText('Encrypt PoC.')).toBeInTheDocument()
    expect(screen.getByText('Run attack.')).toBeInTheDocument()
    expect(screen.getByText('Nodes verify.')).toBeInTheDocument()
    expect(screen.getByText('Pay bounty.')).toBeInTheDocument()
  })
})
