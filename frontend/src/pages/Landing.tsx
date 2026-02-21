import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'motion/react'
import { Hero } from '../components/Hero'
import { HowItWorks } from '../components/HowItWorks'
import { AnimatedStatCard } from '../components/shared/AnimatedStatCard'
import { StatCardSkeletonGrid } from '../components/skeletons/StatCardSkeleton'
import { DEMO_PROJECTS } from '../config'
import { 
  pageTransition, 
  staggerContainer, 
  staggerChild,
  slideUp 
} from '../lib/animations'

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

const ProjectCard = ({ project, index }: { project: typeof DEMO_PROJECTS[0]; index: number }) => (
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
      className={`landing-project-card-status ${project.status === 'active' ? 'active' : 'reporting'}`}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 + index * 0.1 }}
    >
      {project.status === 'active' ? 'ACTIVE' : 'REPORTING'}
    </motion.div>
    
    <h3 className="landing-project-card-title">
      {project.name}
    </h3>
    
    <p className="landing-project-card-desc">
      {project.description.length > 120 
        ? project.description.slice(0, 120) + '...'
        : project.description
      }
    </p>
    
    <div className="landing-project-card-footer">
      <span className="text-[var(--color-text-dim)]">BOUNTY</span>
      <motion.span 
        className="landing-project-card-bounty"
        whileHover={{
          textShadow: '0 0 20px var(--color-primary-glow)'
        }}
      >
        {project.prizePool}
      </motion.span>
    </div>
    
    {project.highFindings > 0 && (
      <div className="landing-project-card-findings">
        <span className="severity-badge high">HIGH</span>
        <span className="landing-project-card-findings-text">
          {project.highFindings} findings
        </span>
      </div>
    )}
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

const FeaturedProjectsSection = () => (
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
        
        <motion.div 
          variants={staggerContainer}
          className="landing-featured-grid"
        >
          {DEMO_PROJECTS.filter(p => p.status === 'active' || p.status === 'report_in_progress').slice(0, 3).map((project, idx) => (
            <ProjectCard key={project.id} project={project} index={idx} />
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
