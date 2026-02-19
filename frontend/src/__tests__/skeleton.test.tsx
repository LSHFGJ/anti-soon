import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'
import { Skeleton } from '@/components/ui/skeleton'
import { 
  StatCardSkeleton, 
  StatCardSkeletonGrid 
} from '@/components/skeletons/StatCardSkeleton'
import { 
  ProjectCardSkeleton, 
  ProjectCardSkeletonGrid,
  ProjectDetailSkeleton 
} from '@/components/skeletons/ProjectCardSkeleton'

describe('Skeleton Components', () => {
  describe('Skeleton (base component)', () => {
    it('should render without crashing', () => {
      const { container } = render(<Skeleton />)
      expect(container).toBeDefined()
    })

    it('should have skeleton-neon class for cyberpunk animation', () => {
      const { container } = render(<Skeleton />)
      const skeleton = container.querySelector('.skeleton-neon')
      expect(skeleton).toBeDefined()
    })

    it('should accept custom className', () => {
      const { container } = render(<Skeleton className="h-4 w-20" />)
      const skeleton = container.firstChild
      expect(skeleton).toHaveClass('h-4')
      expect(skeleton).toHaveClass('w-20')
    })

    it('should have data-slot attribute', () => {
      const { container } = render(<Skeleton />)
      const skeleton = container.querySelector('[data-slot="skeleton"]')
      expect(skeleton).toBeDefined()
    })
  })

  describe('StatCardSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<StatCardSkeleton />)
      expect(container).toBeDefined()
    })

    it('should render within Card component', () => {
      const { container } = render(<StatCardSkeleton />)
      const card = container.querySelector('[data-slot="card"]')
      expect(card).toBeDefined()
    })

    it('should contain 3 skeleton elements (label, value, sub)', () => {
      const { container } = render(<StatCardSkeleton />)
      const skeletons = container.querySelectorAll('.skeleton-neon')
      expect(skeletons).toHaveLength(3)
    })
  })

  describe('StatCardSkeletonGrid', () => {
    it('should render with default count of 4', () => {
      const { container } = render(<StatCardSkeletonGrid />)
      const cards = container.querySelectorAll('[data-slot="card"]')
      expect(cards).toHaveLength(4)
    })

    it('should render with custom count', () => {
      const { container } = render(<StatCardSkeletonGrid count={6} />)
      const cards = container.querySelectorAll('[data-slot="card"]')
      expect(cards).toHaveLength(6)
    })

    it('should have grid layout', () => {
      const { container } = render(<StatCardSkeletonGrid />)
      const grid = container.firstChild
      expect(grid).toHaveClass('grid')
    })
  })

  describe('ProjectCardSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<ProjectCardSkeleton />)
      expect(container).toBeDefined()
    })

    it('should have cyberpunk border styling', () => {
      const { container } = render(<ProjectCardSkeleton />)
      const card = container.firstChild
      expect(card).toHaveClass('border')
    })

    it('should contain multiple skeleton elements', () => {
      const { container } = render(<ProjectCardSkeleton />)
      const skeletons = container.querySelectorAll('.skeleton-neon')
      expect(skeletons.length).toBeGreaterThan(3)
    })
  })

  describe('ProjectCardSkeletonGrid', () => {
    it('should render with default count of 6', () => {
      const { container } = render(<ProjectCardSkeletonGrid />)
      const cards = container.querySelectorAll('.border')
      expect(cards).toHaveLength(6)
    })

    it('should render with custom count', () => {
      const { container } = render(<ProjectCardSkeletonGrid count={3} />)
      const cards = container.querySelectorAll('.border')
      expect(cards).toHaveLength(3)
    })

    it('should have responsive grid layout', () => {
      const { container } = render(<ProjectCardSkeletonGrid />)
      const grid = container.firstChild
      expect(grid).toHaveClass('grid-cols-1')
      expect(grid).toHaveClass('md:grid-cols-2')
      expect(grid).toHaveClass('lg:grid-cols-3')
    })
  })

  describe('ProjectDetailSkeleton', () => {
    it('should render without crashing', () => {
      const { container } = render(<ProjectDetailSkeleton />)
      expect(container).toBeDefined()
    })

    it('should contain stat card skeletons', () => {
      const { container } = render(<ProjectDetailSkeleton />)
      const cards = container.querySelectorAll('[data-slot="card"]')
      expect(cards).toHaveLength(4)
    })

    it('should have space-y-6 for vertical spacing', () => {
      const { container } = render(<ProjectDetailSkeleton />)
      const wrapper = container.firstChild
      expect(wrapper).toHaveClass('space-y-6')
    })
  })

  describe('Cyberpunk Theme Integration', () => {
    it('all skeleton elements should have neon animation class', () => {
      const { container } = render(
        <>
          <StatCardSkeleton />
          <ProjectCardSkeleton />
        </>
      )
      
      const neonElements = container.querySelectorAll('.skeleton-neon')
      expect(neonElements.length).toBeGreaterThan(0)
    })

    it('should use custom cyberpunk border color', () => {
      const { container } = render(<ProjectCardSkeleton />)
      const card = container.firstChild
      expect(card).toBeDefined()
    })
  })

  describe('Export Index', () => {
    it('should re-export all skeleton components', async () => {
      const indexExports = await import('@/components/skeletons')
      
      expect(indexExports.Skeleton).toBeDefined()
      expect(indexExports.StatCardSkeleton).toBeDefined()
      expect(indexExports.StatCardSkeletonGrid).toBeDefined()
      expect(indexExports.ProjectCardSkeleton).toBeDefined()
      expect(indexExports.ProjectCardSkeletonGrid).toBeDefined()
      expect(indexExports.ProjectDetailSkeleton).toBeDefined()
    })
  })
})
