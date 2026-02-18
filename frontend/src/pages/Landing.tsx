import { Link } from 'react-router-dom'
import { Hero } from '../components/Hero'
import { HowItWorks } from '../components/HowItWorks'
import { StatCard } from '../components/shared/StatCard'
import { DEMO_PROJECTS } from '../config'

export function Landing() {
  return (
    <main style={{ minHeight: '100vh' }}>
      <Hero />
      
      <section style={{ padding: '4rem 0', background: 'var(--color-bg-light)' }}>
        <div className="container">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1.5rem' }}>
            <StatCard label="Total Bounties" value="2+" subValue="Active Projects" />
            <StatCard label="Total Paid" value="0 ETH" subValue="In Rewards" />
            <StatCard label="Auditors" value="0" subValue="Registered" />
            <StatCard label="Avg Response" value="<10s" subValue="Verification Time" color="var(--color-secondary)" />
          </div>
        </div>
      </section>

      <section style={{ padding: '4rem 0' }}>
        <div className="container">
          <div className="page-header">
            <h2 className="page-title">Featured Projects</h2>
            <div className="page-divider" />
            <p className="page-subtitle">Active bounty opportunities awaiting your findings</p>
          </div>
          
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(350px, 1fr))', gap: '1.5rem' }}>
            {DEMO_PROJECTS.filter(p => p.status === 'active').slice(0, 3).map((project) => (
              <div key={project.id} style={{
                background: 'linear-gradient(135deg, rgba(17, 17, 17, 0.9), rgba(10, 10, 10, 0.95))',
                border: '1px solid var(--color-bg-light)',
                padding: '1.5rem',
                position: 'relative',
                borderRadius: '4px'
              }}>
                <div style={{
                  position: 'absolute', top: 0, right: 0,
                  padding: '0.25rem 0.75rem',
                  background: 'var(--color-primary)',
                  color: 'var(--color-bg)',
                  fontSize: '0.7rem',
                  fontWeight: 'bold',
                  borderRadius: '0 4px 0 4px'
                }}>
                  ACTIVE
                </div>
                <h3 style={{ fontFamily: 'var(--font-display)', fontSize: '1.2rem', marginBottom: '1rem', color: 'var(--color-text)' }}>
                  {project.name}
                </h3>
                <p style={{ color: 'var(--color-text-dim)', fontSize: '0.85rem', marginBottom: '1rem' }}>
                  {project.description.slice(0, 100)}...
                </p>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontFamily: 'var(--font-mono)', fontSize: '0.85rem' }}>
                  <span style={{ color: 'var(--color-text-dim)' }}>BOUNTY</span>
                  <span style={{ color: 'var(--color-primary)', fontWeight: 'bold' }}>{project.prizePool}</span>
                </div>
              </div>
            ))}
          </div>
          
          <div style={{ textAlign: 'center', marginTop: '2rem' }}>
            <Link to="/explorer" className="btn-cyber">
              View All Projects
            </Link>
          </div>
        </div>
      </section>

      <HowItWorks />

      <section style={{ padding: '4rem 0', background: 'var(--color-bg)' }}>
        <div className="container" style={{ textAlign: 'center' }}>
          <h2 style={{ fontFamily: 'var(--font-display)', fontSize: '2rem', color: 'var(--color-primary)', marginBottom: '1rem' }}>
            READY TO SUBMIT A POC?
          </h2>
          <p style={{ color: 'var(--color-text-dim)', marginBottom: '2rem', maxWidth: '600px', margin: '0 auto 2rem' }}>
            Connect your wallet and use our PoC Builder to craft, encrypt, and submit your vulnerability proof-of-concept.
          </p>
          <Link 
            to="/builder" 
            style={{
              display: 'inline-block',
              fontFamily: 'var(--font-mono)',
              fontSize: '1rem',
              color: 'var(--color-bg)',
              background: 'var(--color-primary)',
              padding: '1rem 2rem',
              textDecoration: 'none',
              border: 'none',
              cursor: 'pointer',
              transition: 'all 0.2s'
            }}
          >
            [ START BUILDING POC ]
          </Link>
        </div>
      </section>
    </main>
  )
}

export default Landing
