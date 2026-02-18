import React, { useCallback, useState } from 'react'
import type { Transaction } from '../../../types/poc'
import { CodeEditor } from '../../CodeEditor'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'

interface TransactionsStepProps {
  transactions: Transaction[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof Transaction, value: string) => void
  onNext: () => void
  onBack: () => void
}

export const TransactionsStep: React.FC<TransactionsStepProps> = React.memo(({ transactions, onAdd, onRemove, onUpdate, onNext, onBack }) => {
  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.transactions} />
       
      {transactions.map((tx, index) => (
        <TransactionItem 
          key={tx.id} 
          transaction={tx} 
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
          fontSize: '0.9rem',
          transition: 'all 0.2s ease'
        }}
      >
        + ADD_TRANSACTION
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

TransactionsStep.displayName = 'TransactionsStep'

interface TransactionItemProps {
  transaction: Transaction
  index: number
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof Transaction, value: string) => void
}

const TransactionItem: React.FC<TransactionItemProps> = React.memo(({ transaction, index, onRemove, onUpdate }) => {
  const [expanded, setExpanded] = useState(true)
  
  const handleChange = useCallback((field: keyof Transaction, value: string) => {
    onUpdate(transaction.id, field, value)
  }, [transaction.id, onUpdate])

  const handleDataChange = useCallback((value: string) => {
    onUpdate(transaction.id, 'data', value)
  }, [transaction.id, onUpdate])

  return (
    <div style={{ 
      border: '1px solid var(--color-text-dim)', 
      marginBottom: '1rem', 
      borderRadius: '4px',
      overflow: 'hidden'
    }}>
      <div 
        style={{ 
          display: 'flex', 
          justifyContent: 'space-between', 
          alignItems: 'center',
          padding: '0.75rem 1rem',
          background: 'rgba(255,255,255,0.02)',
          cursor: 'pointer'
        }}
        onClick={() => setExpanded(!expanded)}
      >
        <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--color-secondary)' }}>
          TX_{String(index + 1).padStart(2, '0')} {expanded ? '▼' : '▶'}
        </span>
        <button 
          onClick={(e) => { e.stopPropagation(); onRemove(transaction.id) }}
          aria-label="Remove transaction"
          style={{ color: 'var(--color-error)', fontWeight: 'bold', background: 'transparent', border: 'none', cursor: 'pointer' }}
        >
          [x]
        </button>
      </div>
      
      {expanded && (
        <div style={{ padding: '1rem' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text)' }}>
                To Address
              </label>
              <input 
                value={transaction.to} 
                onChange={e => handleChange('to', e.target.value)}
                placeholder="0x..."
                style={{ width: '100%', padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
              />
            </div>
            <div>
              <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.85rem', color: 'var(--color-text)' }}>
                Value (ETH in wei)
              </label>
              <input 
                value={transaction.value} 
                onChange={e => handleChange('value', e.target.value)}
                placeholder="0"
                style={{ width: '100%', padding: '0.75rem', background: 'var(--color-bg)', border: '1px solid var(--color-text-dim)', color: 'var(--color-text)', fontFamily: 'var(--font-mono)', fontSize: '0.9rem' }}
              />
            </div>
          </div>
          
          <CodeEditor
            label="Calldata (Hex)"
            value={transaction.data}
            onChange={handleDataChange}
            language="json"
            height={120}
            placeholder="0x..."
          />
        </div>
      )}
    </div>
  )
})

TransactionItem.displayName = 'TransactionItem'
