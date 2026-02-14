import React from 'react'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'

interface ReviewStepProps {
  pocJson: string
  isConnected: boolean
  isSubmitting: boolean
  submissionHash: string
  error: string | null
  onConnect: () => void
  onSubmit: () => void
  onBack: () => void
}

export const ReviewStep: React.FC<ReviewStepProps> = React.memo(({ 
  pocJson, 
  isConnected, 
  isSubmitting, 
  submissionHash, 
  error, 
  onConnect, 
  onSubmit, 
  onBack 
}) => {
  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.review} />
      
      <div style={{ marginBottom: '1.5rem' }}>
        <div style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          marginBottom: '0.75rem'
        }}>
          <h4 style={{ color: 'var(--color-secondary)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}>
            GENERATED_POC.JSON
          </h4>
          <span style={{ 
            fontSize: '0.75rem', 
            color: 'var(--color-text-dim)',
            fontFamily: 'var(--font-mono)'
          }}>
            {pocJson.length} bytes
          </span>
        </div>
        <pre style={{ 
          background: '#000', 
          padding: '1rem', 
          border: '1px solid var(--color-primary-dim)', 
          borderRadius: '4px',
          overflowX: 'auto',
          fontSize: '0.8rem',
          color: 'var(--color-primary)',
          maxHeight: '400px',
          overflowY: 'auto'
        }}>
          {pocJson}
        </pre>
      </div>

      {error && (
        <div style={{ 
          color: 'var(--color-error)', 
          border: '1px solid var(--color-error)', 
          padding: '1rem', 
          marginBottom: '1rem',
          borderRadius: '4px',
          background: 'rgba(255,0,0,0.05)'
        }}>
          <div style={{ fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>ERROR:</div>
          <div style={{ fontSize: '0.9rem' }}>{error}</div>
        </div>
      )}

      {submissionHash && (
        <div style={{ 
          marginBottom: '1rem', 
          padding: '1rem', 
          border: '1px solid var(--color-primary)', 
          background: 'rgba(0, 255, 136, 0.1)',
          borderRadius: '4px',
          animation: 'fadeIn 0.5s ease-in'
        }}>
          <div style={{ color: 'var(--color-primary)', fontWeight: 'bold', fontFamily: 'var(--font-mono)', marginBottom: '0.5rem' }}>
            ✓ PoC_TRANSMITTED
          </div>
          <div style={{ fontSize: '0.85rem', color: 'var(--color-text-dim)', marginBottom: '0.75rem' }}>
            Transaction Hash:
          </div>
          <code style={{ 
            fontSize: '0.8rem', 
            color: 'var(--color-secondary)', 
            background: 'rgba(0,255,136,0.1)', 
            padding: '0.5rem',
            display: 'block',
            borderRadius: '2px',
            wordBreak: 'break-all'
          }}>
            {submissionHash}
          </code>
          
          <div style={{ 
            marginTop: '1rem', 
            padding: '0.75rem', 
            background: 'rgba(0,0,0,0.3)', 
            borderRadius: '4px',
            fontSize: '0.8rem'
          }}>
            <div style={{ color: 'var(--color-text-dim)', marginBottom: '0.5rem' }}>
              NEXT STEPS:
            </div>
            <ol style={{ color: 'var(--color-text)', margin: 0, paddingLeft: '1.5rem' }}>
              <li>CRE Network will verify your PoC</li>
              <li>Tenderly will execute the exploit in sandbox</li>
              <li>AI analysis will validate the impact</li>
              <li>Bounty will be auto-released if valid</li>
            </ol>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: '1rem', justifyContent: 'space-between' }}>
        <button 
          className="btn-cyber" 
          onClick={onBack}
          style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', cursor: 'pointer' }}
        >
          &lt;&lt; BACK
        </button>
        
        <div style={{ display: 'flex', gap: '1rem' }}>
          {!isConnected ? (
            <button 
              className="btn-cyber" 
              onClick={onConnect}
              style={{ padding: '0.75rem 2rem', background: 'var(--color-secondary)', color: 'var(--color-bg)', border: 'none', cursor: 'pointer', fontFamily: 'var(--font-mono)' }}
            >
              [ CONNECT_WALLET ]
            </button>
          ) : (
            <button 
              className="btn-cyber" 
              onClick={onSubmit} 
              disabled={isSubmitting}
              style={{ 
                padding: '0.75rem 2rem', 
                background: isSubmitting ? 'var(--color-text-dim)' : 'var(--color-primary)', 
                color: 'var(--color-bg)', 
                border: 'none', 
                cursor: isSubmitting ? 'not-allowed' : 'pointer',
                fontFamily: 'var(--font-mono)',
                opacity: isSubmitting ? 0.7 : 1
              }}
            >
              {isSubmitting ? (
                <span style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', justifyContent: 'center' }}>
                  <span className="spinner"></span> TRANSMITTING...
                </span>
              ) : '[ ENCRYPT_&_SUBMIT ]'}
            </button>
          )}
        </div>
      </div>
    </div>
  )
})

ReviewStep.displayName = 'ReviewStep'
