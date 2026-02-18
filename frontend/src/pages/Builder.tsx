import { useState } from 'react'
import { PoCBuilder } from '../components/PoCBuilder'
import { DEMO_PROJECTS } from '../config'

export function Builder() {
  const [selectedProject] = useState<typeof DEMO_PROJECTS[0] | null>(null)

  return (
    <main style={{ height: 'calc(100vh - 70px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{
        background: 'var(--color-bg)',
        padding: '1rem 0',
        borderBottom: '1px solid var(--color-bg-light)',
        flexShrink: 0
      }}>
        <div className="container">
          <h1 style={{
            fontFamily: 'var(--font-display)',
            fontSize: '1.2rem',
            color: 'var(--color-primary)',
            marginBottom: '0.25rem'
          }}>
            POC_BUILDER_V1.0
          </h1>
          <p style={{
            fontFamily: 'var(--font-mono)',
            fontSize: '0.75rem',
            color: 'var(--color-text-dim)'
          }}>
            Craft, encrypt, and submit your vulnerability proof-of-concept
          </p>
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'hidden' }}>
        <PoCBuilder selectedProject={selectedProject} />
      </div>
    </main>
  )
}

export default Builder
