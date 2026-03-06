import React, { useCallback, useState } from 'react'
import type { ImpactConfig, ImpactType } from '../../../types/poc'
import { StepGuidance } from '../../StepGuidance'
import { STEP_GUIDES } from '../../StepGuidance/guides'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { useDeferredFieldUpdates } from './useDeferredFieldUpdates'

interface ImpactStepProps {
  config: ImpactConfig
  onUpdate: (field: keyof ImpactConfig, value: string | ImpactType) => void
  onNext: () => void
  onBack: () => void
  showStepNavigation?: boolean
  readOnly?: boolean
}

const IMPACT_TYPES: { value: ImpactType; label: string; description: string }[] = [
  { value: 'fundsDrained', label: 'Funds Drained', description: 'Direct theft of protocol funds' },
  { value: 'accessEscalation', label: 'Access Escalation', description: 'Unauthorized privilege gain' },
  { value: 'stateCorruption', label: 'State Corruption', description: 'Contract state manipulation' },
  { value: 'other', label: 'Other', description: 'Other vulnerability type' },
]

export const ImpactStep: React.FC<ImpactStepProps> = React.memo(({ config, onUpdate, onNext, onBack, showStepNavigation = true, readOnly = false }) => {
  const [draft, setDraft] = useState({
    type: config.type,
    estimatedLoss: config.estimatedLoss,
    description: config.description,
  })

  const { schedule, flush, flushAll } = useDeferredFieldUpdates<'estimatedLoss' | 'description'>((field, value) => {
    onUpdate(field, value)
  })

  const handleTypeChange = useCallback((value: ImpactType) => {
    if (readOnly) {
      return
    }
    setDraft((prev) => ({ ...prev, type: value }))
    onUpdate('type', value)
  }, [onUpdate, readOnly])

  const handleLossChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (readOnly) {
      return
    }
    const nextValue = e.target.value
    setDraft((prev) => ({ ...prev, estimatedLoss: nextValue }))
    schedule('estimatedLoss', nextValue)
  }, [readOnly, schedule])

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    if (readOnly) {
      return
    }
    const nextValue = e.target.value
    setDraft((prev) => ({ ...prev, description: nextValue }))
    schedule('description', nextValue)
  }, [readOnly, schedule])

  const handleBack = useCallback(() => {
    flushAll()
    onBack()
  }, [flushAll, onBack])

  const handleNext = useCallback(() => {
    flushAll()
    onNext()
  }, [flushAll, onNext])

  const selectedType = IMPACT_TYPES.find(t => t.value === draft.type)

  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.impact} />
      
      <Card className="bg-card/50 border-primary/20">
        <CardHeader>
          <CardTitle className="text-base font-mono text-secondary">Vulnerability Classification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="impact-type" className="text-[var(--color-text)] text-sm font-medium">
              Vulnerability Type
            </Label>
            <Select value={draft.type} onValueChange={handleTypeChange} disabled={readOnly}>
              <SelectTrigger
                id="impact-type"
                className="h-9 bg-neutral-900/80 border-neutral-800 text-[var(--color-text)] font-mono text-xs hover:border-[var(--color-primary-dim)] transition-colors"
              >
                <SelectValue placeholder="Select impact type" />
              </SelectTrigger>
              <SelectContent className="bg-[var(--color-bg-panel)] backdrop-blur-md border-neutral-800">
                {IMPACT_TYPES.map((type) => (
                  <SelectItem 
                    key={type.value} 
                    value={type.value}
                    className="text-[var(--color-text)] text-xs font-mono focus:bg-[var(--color-primary-dim)] focus:text-[var(--color-primary)]"
                  >
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selectedType && (
              <p className="text-xs text-muted-foreground font-mono mt-1">
                {selectedType.description}
              </p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="estimated-loss" className="text-[var(--color-text)] text-sm font-medium">
              Estimated Loss (ETH in wei)
            </Label>
            <Input
              id="estimated-loss"
              type="number"
              value={draft.estimatedLoss}
              onChange={handleLossChange}
              onBlur={() => flush('estimatedLoss')}
              disabled={readOnly}
              placeholder="e.g. 1000000000000000000000 (1000 ETH)"
              className="font-mono bg-background/50"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="impact-description" className="text-[var(--color-text)] text-sm font-medium">
              Impact Description
            </Label>
            <Textarea
              id="impact-description"
              rows={3}
              value={draft.description}
              onChange={handleDescriptionChange}
              onBlur={() => flush('description')}
              disabled={readOnly}
              placeholder="Describe the vulnerability impact and how the exploit works..."
              className="font-mono bg-background/50 resize-y min-h-[84px]"
            />
          </div>
        </CardContent>
      </Card>
      
      {showStepNavigation ? (
        <div className="flex justify-between items-center mt-4">
          <Button 
            variant="outline"
            onClick={handleBack}
            className="font-mono"
          >
            &lt;&lt; BACK
          </Button>
          <Button 
            onClick={handleNext}
            className="font-mono bg-primary hover:bg-primary/90"
          >
            REVIEW &gt;&gt;
          </Button>
        </div>
      ) : null}
    </div>
  )
})

ImpactStep.displayName = 'ImpactStep'
