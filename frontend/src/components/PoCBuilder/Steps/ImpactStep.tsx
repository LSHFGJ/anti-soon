import React, { useCallback } from 'react'
import type { ImpactConfig, ImpactType } from '../../../types/poc'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'

interface ImpactStepProps {
  config: ImpactConfig
  onUpdate: (field: keyof ImpactConfig, value: string | ImpactType) => void
  onNext: () => void
  onBack: () => void
}

export const ImpactStep: React.FC<ImpactStepProps> = React.memo(({ config, onUpdate, onNext, onBack }) => {
  const handleChange = useCallback((field: keyof ImpactConfig, value: string | ImpactType) => {
    onUpdate(field, value)
  }, [onUpdate])

  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.impact} />
      
      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text)' }}>
            Vulnerability Type
          </label>
          <select 
            value={config.type} 
            onChange={e => handleChange('type', e.target.value as ImpactType)}
            style={{ width: '100%', padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', cursor: 'pointer' }}
          >
            <option value="fundsDrained">Funds Drained</option>
            <option value="accessEscalation">Access Escalation</option>
            <option value="stateCorruption">State Corruption</option>
            <option value="other">Other</option>
          </select>
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text)' }}>
            Estimated Loss (ETH in wei)
          </label>
          <input 
            type="number" 
            value={config.estimatedLoss} 
            onChange={e => handleChange('estimatedLoss', e.target.value)}
            placeholder="e.g. 1000000000000000000000 (1000 ETH)"
            style={{ width: '100%', padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
          />
        </div>
        
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text)' }}>
            Impact Description
          </label>
          <textarea 
            rows={4} 
            value={config.description} 
            onChange={e => handleChange('description', e.target.value)} 
            placeholder="Describe the vulnerability impact and how the exploit works..."
            style={{ width: '100%', padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', resize: 'vertical' }}
          />
        </div>
      </div>
      
      <div style={{ marginTop: '2rem', display: 'flex', justifyContent: 'space-between' }}>
        <button 
          className="btn-cyber" 
          onClick={onBack}
          style={{ padding: '0.75rem 1.5rem', background: 'transparent', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', cursor: 'pointer' }}
        >
          &lt;&lt; BACK
        </button>
        <button 
          className="btn-cyber" 
          onClick={onNext}
          style={{ padding: '0.75rem 2rem', background: 'var(--color-primary)', color: 'var(--color-bg)', border: 'none', cursor: 'pointer' }}
        >
          REVIEW &gt;&gt;
        </button>
      </div>
    </div>
  )
})

ImpactStep.displayName = 'ImpactStep'
