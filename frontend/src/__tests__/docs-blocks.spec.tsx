import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, describe, expect, it, vi } from 'vitest'

window.scrollTo = vi.fn()

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
  ),
}))

afterEach(() => {
  vi.resetModules()
  vi.doUnmock('../reference/content')
})

describe('docs blocks', () => {
  it('renders code, table, and link-list blocks with deterministic plain markup', async () => {
    vi.doMock('../reference/content', async () => {
      const actual = await vi.importActual<typeof import('../reference/content')>('../reference/content')

      return {
        ...actual,
        DOCS_CONTENT: [
          {
            id: 'architecture',
            slug: 'architecture',
            href: '/docs/architecture',
            locale: 'en',
            title: 'Architecture Blocks Fixture',
            summary: 'Structured docs rendering fixture',
            sections: [
              {
                id: 'technical-blocks',
                anchor: {
                  id: 'technical-blocks',
                  label: 'Technical blocks',
                },
                title: 'Technical blocks',
                summary: 'Deterministic rendering fixture for technical content.',
                blocks: [
                  {
                    type: 'code',
                    language: 'ts',
                    code: 'export const ready = true;\nconsole.log(ready);',
                    caption: 'Bootstrap example',
                  },
                  {
                    type: 'table',
                    columns: ['Setting', 'Value'],
                    rows: [
                      ['mode', 'strict'],
                      ['retries', '3'],
                    ],
                    caption: 'Runtime defaults',
                  },
                  {
                    type: 'link-list',
                    items: [
                      {
                        title: 'Docs overview',
                        href: '/docs',
                        description: 'Return to the landing page.',
                      },
                      {
                        title: 'Architecture',
                        href: '/docs/architecture',
                        description: 'Open the architecture child page.',
                      },
                      {
                        title: 'Protocol reference',
                        href: 'https://example.com/reference',
                        description: 'Read the external protocol reference.',
                      },
                    ],
                  },
                ],
              },
            ],
          },
        ],
      }
    })

    const { Docs } = await import('../pages/Docs')

    render(
      <MemoryRouter initialEntries={['/docs/architecture']}>
        <Docs />
      </MemoryRouter>,
    )

    expect(screen.getByTestId('page-header')).toHaveTextContent('Architecture Blocks Fixture')
    expect(screen.getByText('Bootstrap example')).toBeInTheDocument()
    expect(screen.getByText('ts')).toBeInTheDocument()
    const codeBlock = screen.getByText((content, element) => {
      return element?.tagName.toLowerCase() === 'code' && content.includes('export const ready = true;')
    })

    expect(codeBlock).toHaveTextContent('export const ready = true;')
    expect(codeBlock).toHaveTextContent('console.log(ready);')

    const table = screen.getByRole('table')
    expect(screen.getByText('Runtime defaults')).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Setting' })).toBeInTheDocument()
    expect(within(table).getByRole('columnheader', { name: 'Value' })).toBeInTheDocument()
    expect(within(table).getByText('strict')).toBeInTheDocument()
    expect(within(table).getByText('3')).toBeInTheDocument()

    const docsOverviewLink = screen.getByRole('link', { name: 'Docs overview' })
    const architectureLink = screen.getAllByRole('link', { name: 'Architecture' }).find(l => !l.className.includes('block rounded border')) || screen.getAllByRole('link', { name: 'Architecture' })[0]
    const protocolReferenceLink = screen.getByRole('link', { name: 'Protocol reference' })

    expect(docsOverviewLink).toHaveAttribute('href', '/docs')
    expect(architectureLink).toHaveAttribute('href', '/docs/architecture')
    expect(protocolReferenceLink).toHaveAttribute('href', 'https://example.com/reference')
    expect(screen.getByText('Return to the landing page.')).toBeInTheDocument()
    expect(screen.getByText('Open the architecture child page.')).toBeInTheDocument()
    expect(screen.getByText('Read the external protocol reference.')).toBeInTheDocument()
  })
})
