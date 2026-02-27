import { useCallback, useEffect, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Link } from 'react-router-dom'
import { formatEther } from 'viem'
import { buildPreviewProject, formatPreviewFallbackMessage, shouldUsePreviewFallback } from '@/lib/previewFallback'
import { Hero } from '../components/Hero'
import { HowItWorks } from '../components/HowItWorks'
import { AnimatedStatCard } from '../components/shared/AnimatedStatCard'
import { StatCardSkeletonGrid } from '../components/skeletons/StatCardSkeleton'
import { BOUNTY_HUB_ADDRESS, BOUNTY_HUB_V2_ABI } from '../config'
import { pageTransition, slideUp, staggerChild, staggerContainer } from '../lib/animations'
import { publicClient } from '../lib/publicClient'
import { readProjectsByIds } from '../lib/projectReads'
import type { Project } from '../types'

const AnimatedSection = ({ 
  children, 
  delay = 0,
  className = ''
}: { 
  children: React.ReactNode
  delay?: number
  className?: string
}) => (
  <motion.div
    variants={slideUp}
    initial="hidden"
    whileInView="visible"
    viewport={{ once: true, margin: '-80px' }}
    transition={{ delay }}
    className={className}
  >
    {children}
  </motion.div>
)

const ProjectCard = ({ project, index }: { project: Project; index: number }) => (
  <motion.div
    variants={staggerChild}
    className="landing-project-card"
    whileHover={{ 
      borderColor: 'var(--color-primary-dim)',
      boxShadow: '0 10px 30px -10px var(--color-primary-dim)',
      y: -6
    }}
    transition={{ duration: 0.2, ease: 'linear' }}
  >
    <div className="landing-project-card-highlight" />
    
    <motion.div
      className={`landing-project-card-status ${project.active ? 'active' : 'reporting'}`}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 + index * 0.1 }}
    >
      {project.active ? 'ACTIVE' : 'INACTIVE'}
    </motion.div>
    
    <h3 className="landing-project-card-title">
      {`PROJECT_#${project.id.toString()}`}
    </h3>
    
    <p className="landing-project-card-desc">
      {`Target ${project.targetContract.slice(0, 6)}...${project.targetContract.slice(-4)} on ${project.mode === 0 ? 'UNIQUE' : 'MULTI'} mode.`}
    </p>
    
    <div className="landing-project-card-footer">
      <span className="text-[var(--color-text-dim)]">BOUNTY</span>
      <motion.span 
        className="landing-project-card-bounty"
        whileHover={{
          textShadow: '0 0 20px var(--color-primary-glow)'
        }}
      >
        {`${formatEther(project.bountyPool)} ETH`}
      </motion.span>
    </div>

    <div className="landing-project-card-findings">
      <span className="severity-badge low">LIVE</span>
      <span className="landing-project-card-findings-text">
        Fork @{project.forkBlock.toString()}
      </span>
    </div>
  </motion.div>
)

const StatSection = ({ isLoading }: { isLoading: boolean }) => (
  <section className="landing-stat-section">
    <div className="container">
      <AnimatePresence mode="wait">
        {isLoading ? (
          <motion.div
            key="skeleton"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <StatCardSkeletonGrid count={4} />
          </motion.div>
        ) : (
          <motion.div
            key="stats"
            variants={staggerContainer}
            initial="hidden"
            animate="visible"
            className="landing-stat-grid"
          >
            <AnimatedStatCard
              label="Total Bounties"
              value="2+"
              subValue="Active Projects"
              delay={0}
            />
            <AnimatedStatCard
              label="Total Paid"
              value="0 ETH"
              subValue="In Rewards"
              delay={0.1}
            />
            <AnimatedStatCard
              label="Auditors"
              value="0"
              subValue="Registered"
              delay={0.2}
            />
            <AnimatedStatCard
              label="Avg Response"
              value="<10s"
              subValue="Verification Time"
              color="var(--color-secondary)"
              delay={0.3}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </section>
)

const FeaturedProjectsSection = () => {
  const [projects, setProjects] = useState<Project[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const fetchFeaturedProjects = useCallback(async () => {
    try {
      setIsLoading(true)
      setError(null)

      const nextProjectId = await publicClient.readContract({
        address: BOUNTY_HUB_ADDRESS,
        abi: BOUNTY_HUB_V2_ABI,
        functionName: 'nextProjectId',
      }) as bigint

      if (nextProjectId === 0n) {
        setProjects([])
        return
      }

      const projectIds = Array.from({ length: Number(nextProjectId) }, (_, index) => BigInt(index))
      const fetchedProjects: Project[] = await readProjectsByIds(projectIds)

      setProjects(fetchedProjects.filter((project) => project.active).slice(0, 3))
    } catch (err) {
      console.error('Failed to fetch featured projects:', err)
      if (shouldUsePreviewFallback()) {
        setProjects([buildPreviewProject(0n), buildPreviewProject(1n), buildPreviewProject(2n)])
        setError(formatPreviewFallbackMessage('Failed to load projects from blockchain'))
        return
      }

      setProjects([])
      setError('Failed to load projects from blockchain')
    } finally {
      setIsLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchFeaturedProjects()
  }, [fetchFeaturedProjects])

  return (
    <section className="landing-featured-section">
      <div className="container">
        <motion.div
          variants={staggerContainer}
          initial="hidden"
          whileInView="visible"
          viewport={{ once: true }}
        >
          <motion.div variants={staggerChild} className="page-header">
            <h2 className="page-title">Featured Projects</h2>
            <div className="page-divider" />
            <p className="page-subtitle">Active bounty opportunities awaiting your findings</p>
          </motion.div>

          {error ? (
            <motion.p variants={staggerChild} className="text-sm font-mono text-[var(--color-warning)] mb-4">
              {error}
            </motion.p>
          ) : null}

          <motion.div
            variants={staggerContainer}
            className="landing-featured-grid"
          >
            {isLoading
              ? ['alpha', 'beta', 'gamma'].map((skeletonKey) => (
                  <div key={`featured-skeleton-${skeletonKey}`} className="landing-project-card animate-pulse" aria-hidden />
                ))
              : projects.map((project, idx) => (
                  <ProjectCard key={project.id.toString()} project={project} index={idx} />
                ))}
          </motion.div>

          <motion.div
            variants={staggerChild}
            className="landing-featured-footer"
          >
            <Link to="/explorer" className="btn-cyber">
              View All Projects
            </Link>
          </motion.div>
        </motion.div>
      </div>
    </section>
  )
}

const CTASection = () => (
  <section className="landing-cta-section">
    <div className="landing-cta-bg" />
    <div className="container landing-cta-content">
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <motion.h2 
          variants={staggerChild}
          className="landing-cta-title"
        >
          READY TO SUBMIT A POC?
        </motion.h2>
        
        <motion.p 
          variants={staggerChild}
          className="landing-cta-desc"
        >
          Connect your wallet and use our PoC Builder to craft, encrypt, and submit your vulnerability proof-of-concept. Get verified in seconds, not weeks.
        </motion.p>
        
        <motion.div variants={staggerChild}>
          <Link 
            to="/builder"
            className="btn-cyber landing-cta-btn"
          >
            <span className="opacity-70">[</span>
            <span>START BUILDING POC</span>
            <span className="opacity-70">]</span>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  </section>
)

export function Landing() {
  return (
    <motion.main
      key="page-content"
      variants={pageTransition}
      initial="hidden"
      animate="visible"
      exit="exit"
      className="landing-main"
    >
      <div className="cyber-grid-bg landing-cyber-grid" />
      
      <AnimatedSection>
        <Hero />
      </AnimatedSection>
      
      <StatSection isLoading={false} />
      
      <FeaturedProjectsSection />
      
      <AnimatedSection delay={0.1}>
        <HowItWorks />
      </AnimatedSection>
      
      <CTASection />
      
      <div className="h-12" />
    </motion.main>
  )
}

export default Landing
