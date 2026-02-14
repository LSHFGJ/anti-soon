import React from 'react'

export const HowItWorks: React.FC = () => {
  const steps = [
    {
      title: "SUBMIT_POC",
      icon: "[ \u2191 ]", // Upload arrow
      desc: "Upload proof-of-concept exploit."
    },
    {
      title: "CRE_VERIFIES",
      icon: "[ \u2608 ]", // Node network
      desc: "Decentralized nodes validate hash."
    },
    {
      title: "SIMULATION",
      icon: "[ \u2699 ]", // Gear
      desc: "Tenderly sandbox executes attack."
    },
    {
      title: "PAYOUT",
      icon: "[ \u0024 ]", // Dollar
      desc: "Smart contract releases bounty."
    }
  ]

  return (
    <section className="container" style={{ padding: '6rem 2rem', borderTop: '1px solid var(--color-text-dim)' }}>
      <h2 className="text-secondary" style={{ marginBottom: '4rem', textAlign: 'center' }}>SYSTEM_ARCHITECTURE</h2>
      
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '2rem' }}>
        {steps.map((step, idx) => (
          <div key={idx} style={{ 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            textAlign: 'center',
            position: 'relative'
          }}>
            <div style={{ 
              fontSize: '3rem', 
              color: 'var(--color-primary)', 
              marginBottom: '1rem',
              textShadow: '0 0 10px var(--color-primary-dim)'
            }}>
              {step.icon}
            </div>
            <h3 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>{step.title}</h3>
            <p style={{ color: 'var(--color-text-dim)', fontSize: '0.9rem' }}>{step.desc}</p>
            
            {idx < steps.length - 1 && (
              <div style={{ 
                position: 'absolute', 
                right: '-50%', 
                top: '20%', 
                color: 'var(--color-text-dim)', 
                fontSize: '2rem',
                display: 'none' // Hidden on mobile, could show on desktop with media query
              }}>
                &gt;&gt;
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
