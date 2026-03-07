import { render, screen, waitFor, within } from '@testing-library/react'
import type { ReactNode } from 'react'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockDocsConfig = vi.hoisted(() => ({ docsEnabled: true }))

vi.mock('../config', async () => {
  const actual = await vi.importActual<typeof import('../config')>('../config')

  return {
    ...actual,
    get DOCS_ENABLED() {
      return mockDocsConfig.docsEnabled
    },
  }
})

vi.mock('../providers/Web3Provider', () => ({
  Web3Provider: ({ children }: { children: ReactNode }) => <>{children}</>,
}))

vi.mock('../components/Layout/Navbar', () => ({
  Navbar: () => <nav data-testid="navbar" />,
}))

vi.mock('../components/ToastProvider', () => ({
  ToastProvider: () => <div data-testid="toast-provider" />,
}))

vi.mock('../pages/Landing', () => ({
  Landing: () => <div data-testid="landing-page">landing</div>,
}))

vi.mock('../pages/Explorer', () => ({
  Explorer: () => <div data-testid="explorer-page">explorer</div>,
}))

vi.mock('../pages/Leaderboard', () => ({
  Leaderboard: () => <div data-testid="leaderboard-page">leaderboard</div>,
}))

vi.mock('../pages/ProjectDetail', () => ({
  ProjectDetail: () => <div data-testid="project-detail-page">project detail</div>,
}))

vi.mock('../pages/SubmissionDetail', () => ({
  SubmissionDetail: () => <div data-testid="submission-detail-page">submission detail</div>,
}))

vi.mock('../pages/CreateProject', () => ({
  CreateProject: () => <div data-testid="create-project-page">create project</div>,
}))

vi.mock('../pages/Dashboard', () => ({
  Dashboard: () => <div data-testid="dashboard-page">dashboard</div>,
}))

vi.mock('../pages/Builder', () => ({
  default: () => <div data-testid="builder-page">builder</div>,
}))

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

import App from '../App'
import { Docs } from '../pages/Docs'
import { DOCS_CONTENT } from '../reference/content'

window.scrollTo = vi.fn()

const docsChildPages = DOCS_CONTENT
  .filter((page) => page.href !== '/docs')
  .map((page) => [page.slug, page.href, page.title] as const)

function LocationProbe() {
  const location = useLocation()

  return <div data-testid="location-probe">{`${location.pathname}${location.hash}`}</div>
}

function renderDocsAt(pathname: string) {
  return render(
    <MemoryRouter initialEntries={[pathname]}>
      <Docs />
      <LocationProbe />
    </MemoryRouter>,
  )
}

function getDocsShell() {
  const docsShell = document.querySelector<HTMLElement>('[data-docs-route="page"]')

  expect(docsShell).not.toBeNull()
  return docsShell as HTMLElement
}

beforeEach(() => {
  mockDocsConfig.docsEnabled = true
  window.history.replaceState({}, '', '/')
})

afterEach(() => {
  mockDocsConfig.docsEnabled = true
  window.history.replaceState({}, '', '/')
})

describe('docs multi-page shell', () => {
  it.each(docsChildPages)('renders flat child docs route %s inside the docs shell', async (slug, href, title) => {
    renderDocsAt(href)

    await screen.findByTestId('page-header')

    expect(getDocsShell()).toHaveAttribute('data-docs-page', slug)
    expect(screen.getByTestId('page-header')).toHaveTextContent(title)

    const docsNav = screen.getByRole('navigation', { name: 'Docs pages' })
    const currentPageLink = within(docsNav).getByRole('link', { name: title })

    expect(currentPageLink).toHaveAttribute('href', href)
    expect(currentPageLink).toHaveAttribute('aria-current', 'page')
  })

  it('rejects nested child docs paths by navigating back to /docs', async () => {
    renderDocsAt('/docs/reference/contracts')

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/docs')
      expect(getDocsShell()).toHaveAttribute('data-docs-page', 'overview')
    })

    expect(screen.getByTestId('page-header')).toHaveTextContent(DOCS_CONTENT[0].title)
  })

  it('normalizes a child docs route with a trailing slash before rendering the child page', async () => {
    renderDocsAt('/docs/getting-started/')

    await waitFor(() => {
      expect(screen.getByTestId('location-probe')).toHaveTextContent('/docs/getting-started')
      expect(getDocsShell()).toHaveAttribute('data-docs-page', 'getting-started')
    })

    expect(screen.getByTestId('page-header')).toHaveTextContent('Getting Started')
  })

  it('marks only the active child page in the docs nav', async () => {
    renderDocsAt('/docs/getting-started')

    await screen.findByTestId('page-header')

    const docsNav = screen.getByRole('navigation', { name: 'Docs pages' })
    const currentPageLink = within(docsNav).getByRole('link', { name: 'Getting Started' })
    const overviewLink = within(docsNav).getByRole('link', { name: 'Docs Overview' })
    const architectureLink = within(docsNav).getByRole('link', { name: 'Architecture' })

    expect(currentPageLink).toHaveAttribute('aria-current', 'page')
    expect(currentPageLink).toHaveAttribute('href', '/docs/getting-started')
    expect(overviewLink).not.toHaveAttribute('aria-current')
    expect(architectureLink).not.toHaveAttribute('aria-current')
  })
})

describe('docs disabled redirects', () => {
  it('redirects /docs to home without rendering the docs shell when docs are disabled', async () => {
    mockDocsConfig.docsEnabled = false
    window.history.replaceState({}, '', '/docs')

    render(<App />)

    await screen.findByTestId('landing-page')

    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
    })

    expect(screen.queryByRole('navigation', { name: 'Docs pages' })).not.toBeInTheDocument()
  })

  it('redirects /docs child routes to home without rendering the docs shell when docs are disabled', async () => {
    mockDocsConfig.docsEnabled = false
    window.history.replaceState({}, '', '/docs/getting-started')

    render(<App />)

    await screen.findByTestId('landing-page')

    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
    })

    expect(screen.queryByRole('navigation', { name: 'Docs pages' })).not.toBeInTheDocument()
  })
})
