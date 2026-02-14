import { useState } from 'react'
import { Hero } from './components/Hero'
import { PoCBuilder } from './components/PoCBuilder'
import { HowItWorks } from './components/HowItWorks'
import { useWallet } from './hooks/useWallet'
import { DEMO_PROJECTS } from './config'

function App() {
  const { isConnected, address, connect } = useWallet()
  const [selectedProject, setSelectedProject] = useState<typeof DEMO_PROJECTS[0] | null>(null)

  const scrollToBuilder = () => {
    const builder = document.getElementById('builder')
    builder?.scrollIntoView({ behavior: 'smooth' })
  }

  const handleStart = (project?: typeof DEMO_PROJECTS[0]) => {
    if (project) {
      setSelectedProject(project)
    }
    scrollToBuilder()
  }

  return (
    <>
      <nav style={{ 
        position: 'fixed', 
        top: 0, 
        width: '100%', 
        padding: '1rem 2rem', 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: 'center',
        zIndex: 100,
        background: 'rgba(10, 10, 10, 0.8)',
        backdropFilter: 'blur(10px)',
        borderBottom: '1px solid var(--color-bg-light)'
      }}>
        <div style={{ fontFamily: 'var(--font-display)', fontWeight: 'bold' }}>ANTI-SOON_v1.0</div>
        <button onClick={connect} style={{ color: isConnected ? 'var(--color-primary)' : 'var(--color-text)' }}>
          {isConnected ? `[ CONNECTED: ${address?.slice(0, 6)}...${address?.slice(-4)} ]` : '[ CONNECT_WALLET ]'}
        </button>
      </nav>
      
      <main>
        <Hero onStart={handleStart} selectedProject={selectedProject} />
        <PoCBuilder selectedProject={selectedProject} />
        <HowItWorks />
      </main>

      <footer style={{ padding: '2rem', textAlign: 'center', color: 'var(--color-text-dim)', fontSize: '0.8rem', borderTop: '1px solid var(--color-text-dim)' }}>
        ANTI-SOON &copy; 2026 // DECENTRALIZED_VERIFICATION_NETWORK
      </footer>
    </>
  )
}

export default App
