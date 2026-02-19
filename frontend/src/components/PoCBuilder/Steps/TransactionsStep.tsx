import React, { useCallback, useState } from 'react'
import type { Transaction } from '../../../types/poc'
import { CodeEditor } from '../../CodeEditor'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

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
       
      <div className="space-y-4 mb-6">
        {transactions.map((tx, index) => (
          <TransactionItem 
            key={tx.id} 
            transaction={tx} 
            index={index}
            onRemove={onRemove} 
            onUpdate={onUpdate} 
          />
        ))}
      </div>

      <Button
        onClick={onAdd}
        variant="outline"
        className={cn(
          "w-full mb-8 py-3 border-dashed border-2",
          "text-[var(--color-primary)] border-[var(--color-primary)]",
          "hover:bg-[var(--color-primary-dim)] hover:text-[var(--color-primary)]",
          "font-mono text-sm tracking-wider",
          "transition-all duration-200"
        )}
      >
        + ADD_TRANSACTION
      </Button>
      
      <div className="flex justify-between gap-4">
        <Button
          onClick={onBack}
          variant="outline"
          className={cn(
            "px-6 py-3",
            "bg-transparent border border-[var(--color-text-dim)]",
            "text-[var(--color-text)]",
            "hover:border-[var(--color-primary)] hover:text-[var(--color-primary)]",
            "font-mono tracking-wider",
            "transition-all duration-200"
          )}
        >
          &lt;&lt; BACK
        </Button>
        <Button
          onClick={onNext}
          className={cn(
            "px-8 py-3",
            "bg-[var(--color-primary)] text-[var(--color-bg)]",
            "hover:shadow-[0_0_20px_var(--color-primary-dim)]",
            "font-mono tracking-wider font-semibold",
            "transition-all duration-200"
          )}
        >
          NEXT &gt;&gt;
        </Button>
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
    <Card 
      className={cn(
        "relative overflow-hidden",
        "border border-[var(--color-text-dim)]",
        "bg-[var(--color-bg)]",
        "transition-all duration-300",
        "animate-item-enter",
        "hover:border-[var(--color-primary)]",
        "hover:shadow-[0_0_15px_var(--color-primary-dim)]"
      )}
    >
      <CardHeader 
        className={cn(
          "pb-2 pt-3 px-4 cursor-pointer",
          "bg-[rgba(255,255,255,0.02)]",
          "transition-colors duration-200",
          "hover:bg-[rgba(255,255,255,0.04)]"
        )}
        onClick={() => setExpanded(!expanded)}
      >
        <div className="flex items-center justify-between">
          <span className={cn(
            "font-mono text-xs tracking-wider flex items-center gap-2",
            "text-[var(--color-secondary)]"
          )}>
            <span className={cn(
              "inline-block transition-transform duration-200",
              expanded ? "rotate-0" : "-rotate-90"
            )}>
              ▼
            </span>
            TX_{String(index + 1).padStart(2, '0')}
          </span>
          <Button
            onClick={(e) => { e.stopPropagation(); onRemove(transaction.id) }}
            variant="ghost"
            size="sm"
            aria-label="Remove transaction"
            className={cn(
              "h-auto p-1",
              "text-[var(--color-error)] hover:text-[var(--color-error)]",
              "hover:bg-transparent",
              "font-bold text-lg",
              "transition-all duration-200"
            )}
          >
            [x]
          </Button>
        </div>
      </CardHeader>
      
      {expanded && (
        <CardContent 
          className={cn(
            "pt-3 pb-4 px-4 space-y-4",
            "animate-accordion-down"
          )}
        >
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <label className={cn(
                "block text-sm",
                "text-[var(--color-text)]"
              )}>
                To Address
              </label>
              <input 
                value={transaction.to} 
                onChange={e => handleChange('to', e.target.value)}
                placeholder="0x..."
                className={cn(
                  "w-full h-10 px-3 rounded-sm",
                  "bg-[var(--color-bg)] border border-[var(--color-text-dim)]",
                  "text-[var(--color-primary)] font-mono text-sm",
                  "placeholder:text-[var(--color-text-dim)]",
                  "focus:border-[var(--color-primary)] focus:outline-none",
                  "focus:ring-1 focus:ring-[var(--color-primary-dim)]",
                  "transition-all duration-200"
                )}
              />
            </div>
            <div className="space-y-2">
              <label className={cn(
                "block text-sm",
                "text-[var(--color-text)]"
              )}>
                Value (ETH in wei)
              </label>
              <input 
                value={transaction.value} 
                onChange={e => handleChange('value', e.target.value)}
                placeholder="0"
                className={cn(
                  "w-full h-10 px-3 rounded-sm",
                  "bg-[var(--color-bg)] border border-[var(--color-text-dim)]",
                  "text-[var(--color-primary)] font-mono text-sm",
                  "placeholder:text-[var(--color-text-dim)]",
                  "focus:border-[var(--color-primary)] focus:outline-none",
                  "focus:ring-1 focus:ring-[var(--color-primary-dim)]",
                  "transition-all duration-200"
                )}
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
        </CardContent>
      )}
    </Card>
  )
})

TransactionItem.displayName = 'TransactionItem'
