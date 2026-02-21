import React, { useCallback, useEffect, useState } from 'react'
import type { Transaction } from '../../../types/poc'
import { CodeEditor } from '../../CodeEditor'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDeferredFieldUpdates } from './useDeferredFieldUpdates'

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
  const [expanded, setExpanded] = useState(false)

  type EditableTransactionField = 'to' | 'value' | 'data'
  const [draft, setDraft] = useState({
    to: transaction.to,
    value: transaction.value,
    data: transaction.data,
  })

  useEffect(() => {
    setDraft({
      to: transaction.to,
      value: transaction.value,
      data: transaction.data,
    })
  }, [transaction.to, transaction.value, transaction.data])

  const { schedule, flush, flushAll } = useDeferredFieldUpdates<EditableTransactionField>((field, value) => {
    onUpdate(transaction.id, field, value)
  })

  const handleChange = useCallback((field: EditableTransactionField, value: string) => {
    setDraft((prev) => ({ ...prev, [field]: value }))
    schedule(field, value)
  }, [schedule])

  const handleDataChange = useCallback((value: string) => {
    handleChange('data', value)
  }, [handleChange])

  const handleRemove = useCallback(() => {
    flushAll()
    onRemove(transaction.id)
  }, [flushAll, onRemove, transaction.id])

  return (
    <Card 
      className={cn(
        "relative overflow-hidden",
        "border border-[var(--color-text-dim)]",
        "bg-[var(--color-bg)]",
        "transition-all duration-300",
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
            onClick={(e) => {
              e.stopPropagation()
              handleRemove()
            }}
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
                value={draft.to} 
                onChange={e => handleChange('to', e.target.value)}
                onBlur={() => flush('to')}
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
                value={draft.value} 
                onChange={e => handleChange('value', e.target.value)}
                onBlur={() => flush('value')}
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
            value={draft.data}
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
