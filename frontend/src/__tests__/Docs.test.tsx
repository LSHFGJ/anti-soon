import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
import { Docs } from '../pages/Docs'
import { DOCS_CONTENT } from '../reference/content'

window.scrollTo = vi.fn()

// Mock the primitives so we don't need a full environment
vi.mock('../components/shared/ui-primitives', () => ({
  PageHeader: ({ title, subtitle }: { title: ReactNode; subtitle?: ReactNode }) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
  NeonPanel: ({ children }: { children: ReactNode }) => <div data-testid="neon-panel">{children}</div>,
  StatusBanner: ({ message, variant }: { message: ReactNode; variant: string }) => (
    <div data-testid="status-banner" data-variant={variant}>{message}</div>
  )
}))

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="location-probe">{`${location.pathname}${location.hash}`}</div>
}

describe('docs page rendering', () => {
  it('renders the overview page for /docs/', () => {
    render(
      <MemoryRouter initialEntries={['/docs/']}>
        <Docs />
      </MemoryRouter>
    )

    expect(screen.getByTestId('page-header')).toHaveTextContent(DOCS_CONTENT[0].title)
    expect(screen.queryByText('NOT_FOUND')).not.toBeInTheDocument()
  })

  it('redirects unknown docs paths back to /docs', async () => {
    render(
      <MemoryRouter initialEntries={['/docs/unknown']}>
        <Docs />
        <LocationProbe />
      </MemoryRouter>
    )

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/docs')
    })

    expect(screen.getByTestId('page-header')).toHaveTextContent(DOCS_CONTENT[0].title)
    expect(screen.queryByText('NOT_FOUND')).not.toBeInTheDocument()
  })

  it('renders a real docs page when route matches', () => {
    // DOCS_CONTENT[0] is the overview page with href "/docs"
    const overviewPage = DOCS_CONTENT[0]
    
    render(
      <MemoryRouter initialEntries={['/docs']}>
        <Docs />
      </MemoryRouter>
    )

    // Check header
    expect(screen.getByTestId('page-header')).toHaveTextContent(overviewPage.title)
    
    // Check first section title
    const firstSection = overviewPage.sections[0]
    expect(screen.getByText(firstSection.title)).toBeInTheDocument()
    expect(screen.getByText(firstSection.summary)).toBeInTheDocument()
    
    // Check paragraph block rendering (assuming it exists in overview)
    const paragraphBlock = firstSection.blocks.find(b => b.type === 'paragraph')
    if (paragraphBlock && paragraphBlock.type === 'paragraph') {
      expect(screen.getByText(paragraphBlock.text)).toBeInTheDocument()
    }

    // Check callout rendering if present in the page
    const hasCallout = overviewPage.sections.some(s => s.blocks.some(b => b.type === 'callout'))
    if (hasCallout) {
      expect(screen.getAllByTestId('status-banner').length).toBeGreaterThan(0)
    }
  })

  it('resolves /docs#overview to a real section anchor on the overview page', async () => {
    const scrolledSectionIds: string[] = []
    const originalScrollIntoView = window.HTMLElement.prototype.scrollIntoView

    try {
      window.HTMLElement.prototype.scrollIntoView = function scrollIntoView() {
        scrolledSectionIds.push(this.id)
      }

      render(
        <MemoryRouter initialEntries={[{ pathname: '/docs', hash: '#overview' }]}>
          <Docs />
        </MemoryRouter>
      )

      expect(document.getElementById('overview')).not.toBeNull()

      await waitFor(() => {
        expect(scrolledSectionIds).toContain('overview')
      })
    } finally {
      window.HTMLElement.prototype.scrollIntoView = originalScrollIntoView
    }
  })
})
