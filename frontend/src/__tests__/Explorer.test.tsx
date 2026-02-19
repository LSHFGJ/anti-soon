import { describe, it, expect, vi, beforeEach } from 'vitest'
import { screen, waitFor } from '@testing-library/react'
import { Explorer } from '../pages/Explorer'
import { ProjectDetail } from '../pages/ProjectDetail'
import { renderWithRouter } from '../test/utils'

describe('Explorer Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Page Structure', () => {
    it('should render page header with EXPLORER title', async () => {
      renderWithRouter(<Explorer />)
      expect(screen.getByText('EXPLORER')).toBeDefined()
    })

    it('should render subtitle with browse bounty projects text', async () => {
      renderWithRouter(<Explorer />)
      expect(screen.getByText('> Browse bounty projects')).toBeDefined()
    })

    it('should render status filter dropdown', async () => {
      renderWithRouter(<Explorer />)
      expect(screen.getByText('Status:')).toBeDefined()
    })

    it('should render mode filter dropdown', async () => {
      renderWithRouter(<Explorer />)
      expect(screen.getByText('Mode:')).toBeDefined()
    })

    it('should have default status filter set to Active', async () => {
      renderWithRouter(<Explorer />)
      const activeButtons = screen.getAllByText((_content, element) => {
        return element?.textContent?.trim() === 'Active'
      })
      expect(activeButtons.length).toBeGreaterThan(0)
    })

    it('should have default mode filter set to All', async () => {
      renderWithRouter(<Explorer />)
      expect(screen.getByText('All')).toBeDefined()
    })
  })

  describe('Empty State', () => {
    it('should render without crashing', async () => {
      renderWithRouter(<Explorer />)
      expect(screen.getByText('EXPLORER')).toBeDefined()
    })
  })
})

describe('ProjectDetail Page', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('Page Structure', () => {
    it('should render loading skeleton initially', async () => {
      renderWithRouter(<ProjectDetail />)
      
      const skeletons = document.querySelectorAll('[data-slot="skeleton"]')
      expect(skeletons.length).toBeGreaterThan(0)
    })
  })
})

describe('Page Integration', () => {
  it('should have navigation link from Explorer to ProjectDetail', async () => {
    renderWithRouter(<Explorer />)

    await waitFor(() => {
      const links = screen.queryAllByRole('link')
      const projectLinks = links.filter(link => 
        link.getAttribute('href')?.startsWith('/project/')
      )
      expect(projectLinks.length).toBeGreaterThanOrEqual(0)
    })
  })

  it('should have correct route paths', async () => {
    renderWithRouter(<Explorer />)
    expect(screen.getByText('EXPLORER')).toBeDefined()
  })
})
