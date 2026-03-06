import { render, screen, waitFor } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockDocsConfig = vi.hoisted(() => ({ docsEnabled: true }))
const docsRenderSpy = vi.fn()

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

vi.mock('../pages/Docs', () => ({
  Docs: () => {
    docsRenderSpy()
    return <div data-testid="docs-page">docs page</div>
  },
}))

import App from '../App'

window.scrollTo = vi.fn()

describe('App docs routes', () => {
  beforeEach(() => {
    mockDocsConfig.docsEnabled = true
    docsRenderSpy.mockClear()
    window.history.replaceState({}, '', '/')
  })

  afterEach(() => {
    window.history.replaceState({}, '', '/')
  })

  it('routes /docs to the primary docs page when docs are enabled', async () => {
    window.history.replaceState({}, '', '/docs')

    render(<App />)

    await screen.findByTestId('docs-page')
    expect(docsRenderSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument()
  })

  it('routes unknown /docs/* paths back to /docs before mounting the docs page', async () => {
    window.history.replaceState({}, '', '/docs/unknown')

    render(<App />)

    await screen.findByTestId('docs-page')
    await waitFor(() => {
      expect(window.location.pathname).toBe('/docs')
    })

    expect(docsRenderSpy).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('landing-page')).not.toBeInTheDocument()
  })

  it('redirects /docs to home without mounting docs when docs are disabled', async () => {
    mockDocsConfig.docsEnabled = false
    window.history.replaceState({}, '', '/docs')

    render(<App />)

    await screen.findByTestId('landing-page')
    await waitFor(() => {
      expect(window.location.pathname).toBe('/')
    })
    expect(docsRenderSpy).not.toHaveBeenCalled()
  })
})
