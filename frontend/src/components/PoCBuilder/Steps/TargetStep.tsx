import React, { useState, useCallback } from 'react'
import { isAddress } from 'viem'
import type { TargetConfig } from '../../../types/poc'
import { CodeEditor } from '../../CodeEditor'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'

interface TargetStepProps {
  config: TargetConfig
  onUpdate: (field: keyof TargetConfig, value: string) => void
  onNext: () => void
  onLoadExample?: () => void
}

export const TargetStep: React.FC<TargetStepProps> = React.memo(({ config, onUpdate, onNext, onLoadExample }) => {
  const [errors, setErrors] = useState<Record<string, string>>({})

  const validate = useCallback(() => {
    const newErrors: Record<string, string> = {}
    if (!config.targetContract) newErrors.targetContract = "Target address is required"
    else if (!isAddress(config.targetContract)) newErrors.targetContract = "Invalid Ethereum address"
    
    if (!config.forkBlock) newErrors.forkBlock = "Fork block is required"

    setErrors(newErrors)
    return Object.keys(newErrors).length === 0
  }, [config.targetContract, config.forkBlock])

  const handleNext = useCallback(() => {
    if (validate()) onNext()
  }, [validate, onNext])

  const handleAbiChange = useCallback((value: string) => {
    onUpdate('abiJson', value)
  }, [onUpdate])

  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.target} />
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1rem' }}>
        {onLoadExample && (
          <button 
            onClick={onLoadExample}
            style={{ 
              fontSize: '0.8rem', 
              color: 'var(--color-secondary)', 
              border: '1px solid var(--color-secondary)', 
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              background: 'transparent',
              fontFamily: 'var(--font-mono)',
              transition: 'all 0.2s ease'
            }}
          >
            [ LOAD_EXAMPLE_POC ]
          </button>
        )}
      </div>

      <div style={{ display: 'grid', gap: '1.5rem' }}>
        <div>
          <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text)' }}>
            Target Contract Address
          </label>
          <input 
            value={config.targetContract} 
            onChange={e => onUpdate('targetContract', e.target.value)} 
            placeholder="0x..." 
            style={{ 
              width: '100%', padding: '0.75rem', background: 'var(--color-bg)',
              border: `1px solid ${errors.targetContract ? 'var(--color-error)' : 'var(--color-text-dim)'}`,
              color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem'
            }}
          />
          {errors.targetContract && (
            <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
              {errors.targetContract}
            </span>
          )}
        </div>
        
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text)' }}>
              Chain
            </label>
            <select 
              value={config.chain} 
              onChange={e => onUpdate('chain', e.target.value)}
              style={{ width: '100%', padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem', cursor: 'pointer' }}
            >
              <option value="Mainnet">Ethereum Mainnet</option>
              <option value="Sepolia">Sepolia Testnet</option>
              <option value="Optimism">Optimism</option>
              <option value="Arbitrum">Arbitrum</option>
            </select>
          </div>
          <div>
            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text)' }}>
              Fork Block Number
            </label>
            <input 
              value={config.forkBlock} 
              onChange={e => onUpdate('forkBlock', e.target.value)} 
              placeholder="e.g. 18500000" 
              type="number" 
              style={{ width: '100%', padding: '0.75rem', background: 'var(--color-bg)', border: `1px solid ${errors.forkBlock ? 'var(--color-error)' : 'var(--color-text-dim)'}`, color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
            />
            {errors.forkBlock && (
              <span style={{ color: 'var(--color-error)', fontSize: '0.8rem', marginTop: '0.25rem', display: 'block' }}>
                {errors.forkBlock}
              </span>
            )}
          </div>
        </div>
        
        <CodeEditor
          label="Contract ABI (JSON)"
          value={config.abiJson}
          onChange={handleAbiChange}
          language="json"
          height={250}
          placeholder='[{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}]'
        />
      </div>
      
      <div style={{ marginTop: '2rem', textAlign: 'right' }}>
        <button 
          className="btn-cyber" 
          onClick={handleNext}
          style={{ padding: '0.75rem 2rem', fontSize: '1rem', fontFamily: 'var(--font-mono)', background: 'var(--color-primary)', color: 'var(--color-bg)', border: 'none', cursor: 'pointer' }}
        >
          NEXT &gt;&gt;
        </button>
      </div>
    </div>
  )
})

TargetStep.displayName = 'TargetStep'
