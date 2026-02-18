import React from 'react'

export const Hero: React.FC = () => {
  return (
    <section className="container" style={{ minHeight: '80vh', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'flex-start' }}>
      <div style={{ position: 'relative', marginBottom: '2rem' }}>
        <h1 className="glitch-text" data-text="ANTI-SOON" style={{ fontSize: '5rem', color: 'var(--color-primary)', marginBottom: '0.5rem' }}>
          ANTI-SOON
        </h1>
        <div style={{ height: '2px', background: 'var(--color-secondary)', width: '100px' }}></div>
      </div>

      <h2 style={{ color: 'var(--color-text)', fontSize: '1.5rem', marginBottom: '1.5rem', fontFamily: 'var(--font-mono)' }}>
        No more soon. <span style={{ color: 'var(--color-secondary)' }}>Verify now.</span> <span style={{ color: 'var(--color-primary)' }}>Get paid now.</span>
      </h2>

      <p style={{ maxWidth: '600px', marginBottom: '2rem', color: 'var(--color-text-dim)', lineHeight: '1.6' }}>
        Decentralized vulnerability verification powered by Chainlink CRE. 
        Submit a PoC, get it verified by decentralized nodes, receive bounty instantly.
        <br />
        <span style={{ color: 'var(--color-secondary)' }}>&gt; System Status: ONLINE</span>
      </p>

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
