import { useState, useEffect } from 'react'
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

const PageLoadingSkeleton = () => (
  <div className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center' }}>
    <div style={{ 
      height: '5rem', 
      width: '400px', 
      marginBottom: '2rem',
      background: 'linear-gradient(90deg, rgba(17, 17, 17, 1) 0%, rgba(0, 255, 157, 0.15) 50%, rgba(17, 17, 17, 1) 100%)',
      backgroundSize: '200% 100%',
      animation: 'skeleton-neon-pulse 1.5s ease-in-out infinite',
      borderRadius: '4px'
    }} />
    <div style={{ 
      height: '1.5rem', 
      width: '350px', 
      marginBottom: '1rem',
      background: 'linear-gradient(90deg, rgba(17, 17, 17, 1) 0%, rgba(0, 255, 157, 0.1) 50%, rgba(17, 17, 17, 1) 100%)',
      backgroundSize: '200% 100%',
      animation: 'skeleton-neon-pulse 1.5s ease-in-out infinite',
      borderRadius: '2px'
    }} />
    <div style={{ 
      height: '1rem', 
      width: '500px', 
      background: 'linear-gradient(90deg, rgba(17, 17, 17, 1) 0%, rgba(0, 255, 157, 0.08) 50%, rgba(17, 17, 17, 1) 100%)',
      backgroundSize: '200% 100%',
      animation: 'skeleton-neon-pulse 1.5s ease-in-out infinite',
      borderRadius: '2px'
    }} />
  </div>
)

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
    style={{
      background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
      border: '1px solid var(--color-bg-light)',
      padding: '1.5rem',
      position: 'relative',
      borderRadius: '4px',
      transition: 'all 0.3s ease'
    }}
    whileHover={{ 
      borderColor: 'var(--color-primary)',
      boxShadow: '0 0 40px rgba(0, 255, 157, 0.15)',
      y: -6
    }}
    transition={{ type: 'spring', stiffness: 300, damping: 20 }}
  >
    <motion.div
      style={{
        position: 'absolute', 
        top: 0, 
        right: 0,
        padding: '0.25rem 0.75rem',
        background: project.status === 'active' ? 'var(--color-primary)' : 'var(--color-secondary)',
        color: 'var(--color-bg)',
        fontSize: '0.7rem',
        fontWeight: 'bold',
        borderRadius: '0 4px 0 4px',
        letterSpacing: '0.05em'
      }}
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: 0.2 + index * 0.1 }}
    >
      {project.status === 'active' ? 'ACTIVE' : 'REPORTING'}
    </motion.div>
    
    <h3 style={{ 
      fontFamily: 'var(--font-display)', 
      fontSize: '1.2rem', 
      marginBottom: '1rem', 
      color: 'var(--color-text)',
      paddingRight: '4rem'
    }}>
      {project.name}
    </h3>
    
    <p style={{ 
      color: 'var(--color-text-dim)', 
      fontSize: '0.85rem', 
      marginBottom: '1rem',
      lineHeight: 1.6,
      minHeight: '3.2em'
    }}>
      {project.description.length > 120 
        ? project.description.slice(0, 120) + '...'
        : project.description
      }
    </p>
    
    <div style={{ 
      display: 'flex', 
      justifyContent: 'space-between', 
      fontFamily: 'var(--font-mono)', 
      fontSize: '0.85rem',
      alignItems: 'center'
    }}>
      <span style={{ color: 'var(--color-text-dim)' }}>BOUNTY</span>
      <motion.span 
        style={{ 
          color: 'var(--color-primary)', 
          fontWeight: 'bold'
        }}
        whileHover={{
          textShadow: '0 0 15px rgba(0, 255, 157, 0.5)'
        }}
      >
        {project.prizePool}
      </motion.span>
    </div>
    
    {project.highFindings > 0 && (
      <div style={{ 
        marginTop: '0.75rem',
        display: 'flex',
        gap: '0.5rem',
        alignItems: 'center'
      }}>
        <span className="severity-badge high">HIGH</span>
        <span style={{ 
          color: 'var(--color-text-dim)', 
          fontSize: '0.75rem',
          fontFamily: 'var(--font-mono)'
        }}>
          {project.highFindings} findings
        </span>
      </div>
    )}
  </motion.div>
)

const StatSection = ({ isLoading }: { isLoading: boolean }) => (
  <section style={{ padding: '4rem 0', background: 'var(--color-bg-light)' }}>
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
            style={{ 
              display: 'grid', 
              gridTemplateColumns: 'repeat(4, 1fr)', 
              gap: '1.5rem' 
            }}
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
              color="#00f0ff"
              delay={0.3}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  </section>
)

const FeaturedProjectsSection = () => (
  <section style={{ padding: '4rem 0' }}>
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
          style={{ 
            display: 'grid', 
            gridTemplateColumns: 'repeat(3, 1fr)', 
            gap: '1.5rem',
            marginTop: '2rem'
          }}
        >
          {DEMO_PROJECTS.filter(p => p.status === 'active' || p.status === 'report_in_progress').slice(0, 3).map((project, idx) => (
            <ProjectCard key={project.id} project={project} index={idx} />
          ))}
        </motion.div>
        
        <motion.div 
          variants={staggerChild}
          style={{ textAlign: 'center', marginTop: '2.5rem' }}
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
  <section style={{ 
    padding: '5rem 0', 
    background: 'linear-gradient(180deg, var(--color-bg) 0%, rgba(0, 255, 157, 0.03) 50%, var(--color-bg) 100%)',
    borderTop: '1px solid rgba(0, 255, 157, 0.1)',
    borderBottom: '1px solid rgba(0, 255, 157, 0.1)'
  }}>
    <div className="container" style={{ textAlign: 'center' }}>
      <motion.div
        variants={staggerContainer}
        initial="hidden"
        whileInView="visible"
        viewport={{ once: true }}
      >
        <motion.h2 
          variants={staggerChild}
          style={{ 
            fontFamily: 'var(--font-display)', 
            fontSize: '2.5rem', 
            color: 'var(--color-primary)', 
            marginBottom: '1.5rem',
            textShadow: '0 0 30px rgba(0, 255, 157, 0.3)'
          }}
        >
          READY TO SUBMIT A POC?
        </motion.h2>
        
        <motion.p 
          variants={staggerChild}
          style={{ 
            color: 'var(--color-text-dim)', 
            marginBottom: '2rem', 
            maxWidth: '600px', 
            margin: '0 auto 2rem',
            lineHeight: 1.6
          }}
        >
          Connect your wallet and use our PoC Builder to craft, encrypt, and submit your vulnerability proof-of-concept. Get verified in seconds, not weeks.
        </motion.p>
        
        <motion.div variants={staggerChild}>
          <Link 
            to="/builder"
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.75rem',
              fontFamily: 'var(--font-mono)',
              fontSize: '1rem',
              color: 'var(--color-bg)',
              background: 'var(--color-primary)',
              padding: '1rem 2.5rem',
              textDecoration: 'none',
              border: 'none',
              cursor: 'pointer',
              boxShadow: '0 0 25px rgba(0, 255, 157, 0.3)',
              transition: 'all 0.3s ease'
            }}
          >
            <span style={{ opacity: 0.7 }}>[</span>
            <span>START BUILDING POC</span>
            <span style={{ opacity: 0.7 }}>]</span>
          </Link>
        </motion.div>
      </motion.div>
    </div>
  </section>
)

export function Landing() {
  const [isLoading, setIsLoading] = useState(true)
  const [statsLoaded, setStatsLoaded] = useState(false)
  
  useEffect(() => {
    const loadTimer = setTimeout(() => setIsLoading(false), 400)
    const statsTimer = setTimeout(() => setStatsLoaded(true), 800)
    
    return () => {
      clearTimeout(loadTimer)
      clearTimeout(statsTimer)
    }
  }, [])
  
  return (
    <AnimatePresence mode="wait">
      {isLoading ? (
        <motion.div
          key="page-loading"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
        >
          <PageLoadingSkeleton />
        </motion.div>
      ) : (
        <motion.main
          key="page-content"
          variants={pageTransition}
          initial="hidden"
          animate="visible"
          exit="exit"
          style={{ minHeight: '100vh', position: 'relative' }}
        >
          <div 
            className="cyber-grid-bg"
            style={{
              position: 'fixed',
              top: 0,
              left: 0,
              right: 0,
              bottom: 0,
              zIndex: -1,
              opacity: 0.4
            }}
          />
          
          <AnimatedSection>
            <Hero />
          </AnimatedSection>
          
          <StatSection isLoading={!statsLoaded} />
          
          <FeaturedProjectsSection />
          
          <AnimatedSection delay={0.1}>
            <HowItWorks />
          </AnimatedSection>
          
          <CTASection />
          
          <div style={{ height: '3rem' }} />
        </motion.main>
      )}
    </AnimatePresence>
  )
}

export default Landing
