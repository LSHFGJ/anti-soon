import React, { useCallback } from 'react'
import type { Condition } from '../../../types/poc'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'

interface ConditionsStepProps {
  conditions: Condition[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof Condition, value: string) => void
  onNext: () => void
  onBack: () => void
}

export const ConditionsStep: React.FC<ConditionsStepProps> = React.memo(({ conditions, onAdd, onRemove, onUpdate, onNext, onBack }) => {
  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.conditions} />
      
      {conditions.map((cond, index) => (
        <ConditionItem 
          key={cond.id} 
          condition={cond}
          index={index}
          onRemove={onRemove} 
          onUpdate={onUpdate} 
        />
      ))}
      
      <button 
        onClick={onAdd} 
        style={{ 
          color: 'var(--color-primary)', 
          border: '1px dashed var(--color-primary)', 
          padding: '0.75rem', 
          width: '100%', 
          marginBottom: '2rem',
          background: 'transparent',
          cursor: 'pointer',
          fontFamily: 'var(--font-mono)',
          fontSize: '0.9rem'
        }}
      >
        + ADD_CONDITION
      </button>
      
      <div style={{ display: 'flex', justifyContent: 'space-between' }}>
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
          NEXT &gt;&gt;
        </button>
      </div>
    </div>
  )
})

ConditionsStep.displayName = 'ConditionsStep'

interface ConditionItemProps {
  condition: Condition
  index: number
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof Condition, value: string) => void
}

const ConditionItem: React.FC<ConditionItemProps> = React.memo(({ condition, index, onRemove, onUpdate }) => {
  const handleChange = useCallback((field: keyof Condition, value: string) => {
    onUpdate(condition.id, field, value)
  }, [condition.id, onUpdate])

  return (
    <div style={{ 
      border: '1px solid var(--color-text-dim)', 
      padding: '1rem', 
      marginBottom: '1rem', 
      position: 'relative',
      borderRadius: '4px'
    }}>
      <div style={{ 
        position: 'absolute', 
        top: '0.5rem', 
        left: '1rem',
        fontFamily: 'var(--font-mono)',
        color: 'var(--color-secondary)',
        fontSize: '0.8rem'
      }}>
        COND_{String(index + 1).padStart(2, '0')}
      </div>
      
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '1rem', marginBottom: '0.5rem', marginTop: '1rem' }}>
        <select 
          value={condition.type} 
          onChange={e => handleChange('type', e.target.value)}
          style={{ padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
        >
          <option value="setBalance">Set Balance (ETH)</option>
          <option value="setTimestamp">Set Timestamp</option>
          <option value="setStorage">Set Storage Slot</option>
        </select>
        <input 
          placeholder="Value (e.g. 1000000000000000000)" 
          value={condition.value} 
          onChange={e => handleChange('value', e.target.value)}
          style={{ padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
        />
      </div>
      
      {condition.type === 'setBalance' && (
        <input 
          placeholder="Target Address" 
          value={condition.target || ''} 
          onChange={e => handleChange('target', e.target.value)}
          style={{ width: '100%', padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)', marginTop: '0.5rem' }}
        />
      )}
      
      {condition.type === 'setStorage' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginTop: '0.5rem' }}>
          <input 
            placeholder="Contract Address" 
            value={condition.target || ''} 
            onChange={e => handleChange('target', e.target.value)}
            style={{ padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
          />
          <input 
            placeholder="Slot (Hex)" 
            value={condition.slot || ''} 
            onChange={e => handleChange('slot', e.target.value)}
            style={{ padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)' }}
          />
        </div>
      )}
      
      <button 
        onClick={() => onRemove(condition.id)}
        style={{ position: 'absolute', top: '0.5rem', right: '0.5rem', color: 'var(--color-error)', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}
      >
        [x]
      </button>
    </div>
  )
})

ConditionItem.displayName = 'ConditionItem'
