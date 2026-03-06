import React, { useCallback, useState } from 'react'
import type { Condition } from '../../../types/poc'
import { StepGuidance } from '../../StepGuidance'
import { STEP_GUIDES } from '../../StepGuidance/guides'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { useDeferredFieldUpdates } from './useDeferredFieldUpdates'

interface ConditionsStepProps {
  conditions: Condition[]
  onAdd: () => void
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof Condition, value: string) => void
  onNext: () => void
  onBack: () => void
  showStepNavigation?: boolean
  readOnly?: boolean
}

export const ConditionsStep: React.FC<ConditionsStepProps> = React.memo(({ conditions, onAdd, onRemove, onUpdate, onNext, onBack, showStepNavigation = true, readOnly = false }) => {
  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.conditions} />
      
      <div className="space-y-4 mb-6">
        {conditions.map((cond, index) => (
          <ConditionItem 
            key={cond.id} 
            condition={cond}
            index={index}
            onRemove={onRemove} 
            onUpdate={onUpdate} 
            readOnly={readOnly}
          />
        ))}
      </div>
      
      <Button
        onClick={onAdd}
        disabled={readOnly}
        variant="outline"
        className={cn(
          "w-full mb-8 py-3 border-dashed border-2",
          "text-[var(--color-primary)] border-[var(--color-primary)]",
          "hover:bg-[var(--color-primary-dim)] hover:text-[var(--color-primary)]",
          "font-mono text-sm tracking-wider",
          "transition-all duration-200"
        )}
      >
        + ADD_CONDITION
      </Button>
      
      {showStepNavigation ? (
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
      ) : null}
    </div>
  )
})

ConditionsStep.displayName = 'ConditionsStep'

interface ConditionItemProps {
  condition: Condition
  index: number
  onRemove: (id: string) => void
  onUpdate: (id: string, field: keyof Condition, value: string) => void
  readOnly: boolean
}

const ConditionItem: React.FC<ConditionItemProps> = React.memo(({ condition, index, onRemove, onUpdate, readOnly }) => {
  type EditableConditionField = 'type' | 'value' | 'target' | 'slot'

  const [draft, setDraft] = useState({
    type: condition.type,
    value: condition.value,
    target: condition.target || '',
    slot: condition.slot || ''
  })

  const { schedule, flush, flushAll } = useDeferredFieldUpdates<EditableConditionField>((field, value) => {
    onUpdate(condition.id, field, value)
  })

  const handleChange = useCallback((field: EditableConditionField, value: string) => {
    if (readOnly) {
      return
    }
    setDraft((prev) => ({ ...prev, [field]: value }))
    schedule(field, value)
  }, [readOnly, schedule])

  const handleRemove = useCallback(() => {
    flushAll()
    onRemove(condition.id)
  }, [condition.id, flushAll, onRemove])

  return (
    <Card 
      className={cn(
        "relative overflow-hidden",
        "border border-[var(--color-text-dim)]",
        "bg-[var(--color-bg)]",
        "transition-all duration-200 ease-linear",
        "animate-item-enter",
        "hover:border-[var(--color-primary)]",
        "hover:shadow-[0_0_15px_var(--color-primary-dim)]"
      )}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <span className={cn(
            "font-mono text-xs tracking-wider",
            "text-[var(--color-secondary)]"
          )}>
            COND_{String(index + 1).padStart(2, '0')}
          </span>
          <Button
            onClick={handleRemove}
            disabled={readOnly}
            variant="ghost"
            size="sm"
            aria-label="Remove condition"
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
      
      <CardContent className="pt-2 pb-4 px-4 space-y-3">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-[1fr_2fr]">
          <select 
            value={draft.type} 
            onChange={e => handleChange('type', e.target.value)}
            onBlur={() => flush('type')}
            disabled={readOnly}
            className={cn(
              "h-9 px-3 rounded-sm",
              "bg-neutral-900/80 border border-neutral-800",
              "text-[var(--color-text)] font-mono text-xs",
              "hover:border-[var(--color-primary-dim)]",
              "focus:border-[var(--color-primary)] focus:outline-none",
              "focus:ring-1 focus:ring-[var(--color-primary-dim)]",
              "transition-colors",
              "cursor-pointer"
            )}
          >
            <option value="setBalance">Set Balance (ETH)</option>
            <option value="setTimestamp">Set Timestamp</option>
            <option value="setStorage">Set Storage Slot</option>
          </select>
          <input 
            placeholder="Value (e.g. 1000000000000000000)" 
            value={draft.value} 
            onChange={e => handleChange('value', e.target.value)}
            onBlur={() => flush('value')}
            disabled={readOnly}
            className={cn(
              "h-10 px-3 rounded-sm",
              "bg-[var(--color-bg)] border border-[var(--color-text-dim)]",
              "text-[var(--color-primary)] font-mono text-sm",
              "placeholder:text-[var(--color-text-dim)]",
              "focus:border-[var(--color-primary)] focus:outline-none",
              "focus:ring-1 focus:ring-[var(--color-primary-dim)]",
              "transition-all duration-200"
            )}
          />
        </div>
        
        {draft.type === 'setBalance' && (
          <input 
            placeholder="Target Address" 
            value={draft.target} 
            onChange={e => handleChange('target', e.target.value)}
            onBlur={() => flush('target')}
            disabled={readOnly}
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
        )}
        
        {draft.type === 'setStorage' && (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input 
              placeholder="Contract Address" 
              value={draft.target} 
              onChange={e => handleChange('target', e.target.value)}
              onBlur={() => flush('target')}
              disabled={readOnly}
              className={cn(
                "h-10 px-3 rounded-sm",
                "bg-[var(--color-bg)] border border-[var(--color-text-dim)]",
                "text-[var(--color-primary)] font-mono text-sm",
                "placeholder:text-[var(--color-text-dim)]",
                "focus:border-[var(--color-primary)] focus:outline-none",
                "focus:ring-1 focus:ring-[var(--color-primary-dim)]",
                "transition-all duration-200"
              )}
            />
            <input 
              placeholder="Slot (Hex)" 
              value={draft.slot} 
              onChange={e => handleChange('slot', e.target.value)}
              onBlur={() => flush('slot')}
              disabled={readOnly}
              className={cn(
                "h-10 px-3 rounded-sm",
                "bg-[var(--color-bg)] border border-[var(--color-text-dim)]",
                "text-[var(--color-primary)] font-mono text-sm",
                "placeholder:text-[var(--color-text-dim)]",
                "focus:border-[var(--color-primary)] focus:outline-none",
                "focus:ring-1 focus:ring-[var(--color-primary-dim)]",
                "transition-all duration-200"
              )}
            />
          </div>
        )}
      </CardContent>
    </Card>
  )
})

ConditionItem.displayName = 'ConditionItem'
