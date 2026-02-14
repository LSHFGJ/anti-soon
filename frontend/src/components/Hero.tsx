import React, { useState } from 'react'
import { DEMO_PROJECTS } from '../config'

interface HeroProps {
  onStart: (project?: typeof DEMO_PROJECTS[0]) => void
  selectedProject: typeof DEMO_PROJECTS[0] | null
}

export const Hero: React.FC<HeroProps> = ({ onStart }) => {
  const [activeProjectId, setActiveProjectId] = useState<string>('')

  const handleStart = () => {
    const project = DEMO_PROJECTS.find(p => p.id === activeProjectId)
    onStart(project)
  }

  return (
    <section className="container" style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
      <div style={{ position: 'relative', marginBottom: '2rem' }}>
        <h1 className="glitch-text" data-text="ANTI-SOON" style={{ fontSize: '5rem', color: 'var(--color-primary)', marginBottom: '0.5rem' }}>
          ANTI-SOON
        </h1>
        <div style={{ height: '2px', background: 'var(--color-secondary)', width: '100px' }}></div>
      </div>

      <h2 style={{ color: 'var(--color-text)', fontSize: '1.5rem', marginBottom: '1.5rem', fontFamily: 'var(--font-mono)' }}>
        No more soon. <span className="text-secondary">Verify now.</span> <span className="text-primary">Get paid now.</span>
      </h2>

      <p style={{ maxWidth: '600px', marginBottom: '3rem', color: 'var(--color-text-dim)', lineHeight: '1.6' }}>
        Decentralized vulnerability verification powered by Chainlink CRE. 
        Submit a PoC, get it verified by decentralized nodes, receive bounty instantly.
        <br />
        <span style={{ color: 'var(--color-secondary)' }}>&gt; System Status: ONLINE</span>
      </p>

      <div style={{ marginBottom: '2rem', width: '100%', maxWidth: '500px' }}>
        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>
          SELECT_TARGET_PROJECT
        </label>
        <div style={{ display: 'flex', gap: '1rem', flexDirection: 'column' }}>
          <select 
            value={activeProjectId} 
            onChange={(e) => setActiveProjectId(e.target.value)}
            style={{ 
              width: '100%', 
              padding: '1rem', 
              background: 'rgba(10, 10, 10, 0.5)', 
              border: '1px solid var(--color-primary)', 
              color: 'var(--color-text)',
              fontFamily: 'var(--font-mono)',
              fontSize: '1rem',
              cursor: 'pointer'
            }}
          >
            <option value="">[ BLANK_TEMPLATE ] - Start from Scratch</option>
            {DEMO_PROJECTS.map(p => (
              <option key={p.id} value={p.id}>[ DEMO ] {p.name} - ${p.prizePool}</option>
            ))}
          </select>

          {activeProjectId && (
            <div style={{ 
              padding: '1rem', 
              border: '1px dashed var(--color-secondary)',
              background: 'rgba(0, 255, 136, 0.05)',
              animation: 'fadeIn 0.5s ease-in'
            }}>
              <div style={{ color: 'var(--color-secondary)', marginBottom: '0.5rem', fontWeight: 'bold' }}>
                &gt; TARGET_ACQUIRED: {DEMO_PROJECTS.find(p => p.id === activeProjectId)?.name}
              </div>
              <div style={{ fontSize: '0.9rem', color: 'var(--color-text-dim)' }}>
                {DEMO_PROJECTS.find(p => p.id === activeProjectId)?.description}
              </div>
            </div>
          )}
          
          <button onClick={handleStart} className="btn-cyber" style={{ fontSize: '1.2rem', marginTop: '1rem', width: '100%', textAlign: 'center' }}>
            {activeProjectId ? '[ INITIATE_EXPLOIT ]' : '[ START_BUILDING_POC ]'}
          </button>
        </div>
      </div>


      <div style={{ 
        position: 'absolute', 
        top: 0, 
        left: 0, 
        width: '100%', 
        height: '100%', 
        zIndex: -1, 
        opacity: 0.1,
        pointerEvents: 'none',
        backgroundImage: 'linear-gradient(var(--color-primary) 1px, transparent 1px), linear-gradient(90deg, var(--color-primary) 1px, transparent 1px)',
        backgroundSize: '40px 40px'
      }}></div>
    </section>
  )
}
