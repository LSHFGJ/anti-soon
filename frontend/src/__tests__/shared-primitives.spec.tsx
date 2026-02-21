import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { MetaRow, NeonPanel, PageHeader, StatusBanner } from '../components/shared/ui-primitives'

describe('shared ui primitives', () => {
  it('renders page header with title and subtitle', () => {
    render(<PageHeader title='DASHBOARD' subtitle='> Your audit performance and submission history' />)

    expect(screen.getByRole('heading', { name: 'DASHBOARD' })).toBeInTheDocument()
    expect(screen.getByText('> Your audit performance and submission history')).toBeInTheDocument()
  })

  it('renders status banner with warning variant', () => {
    render(<StatusBanner variant='warning' message='Awaiting finalization' />)

    expect(screen.getByText('Awaiting finalization')).toBeInTheDocument()
  })

  it('renders meta rows consistently', () => {
    render(<MetaRow label='COMMIT_HASH' value='0xabc' />)

    expect(screen.getByText('COMMIT_HASH')).toBeInTheDocument()
    expect(screen.getByText('0xabc')).toBeInTheDocument()
  })

  it('renders neon panel wrapper content', () => {
    render(
      <NeonPanel>
        <div>panel-content</div>
      </NeonPanel>
    )

    expect(screen.getByText('panel-content')).toBeInTheDocument()
  })

  it('fails intentionally for missing status banner variant', () => {
    if (process.env.TASK13_INTENTIONAL_FAILURE !== '1') {
      expect(true).toBe(true)
      return
    }

    render(<StatusBanner variant={'missing-variant'} message='expected runtime guard failure' />)
  })
})
