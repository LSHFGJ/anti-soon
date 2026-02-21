import React, { useCallback, useEffect, useState } from 'react'
import type { ImpactConfig, ImpactType } from '../../../types/poc'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'
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
}

const IMPACT_TYPES: { value: ImpactType; label: string; description: string }[] = [
  { value: 'fundsDrained', label: 'Funds Drained', description: 'Direct theft of protocol funds' },
  { value: 'accessEscalation', label: 'Access Escalation', description: 'Unauthorized privilege gain' },
  { value: 'stateCorruption', label: 'State Corruption', description: 'Contract state manipulation' },
  { value: 'other', label: 'Other', description: 'Other vulnerability type' },
]

export const ImpactStep: React.FC<ImpactStepProps> = React.memo(({ config, onUpdate, onNext, onBack }) => {
  const [draft, setDraft] = useState({
    type: config.type,
    estimatedLoss: config.estimatedLoss,
    description: config.description,
  })

  useEffect(() => {
    setDraft({
      type: config.type,
      estimatedLoss: config.estimatedLoss,
      description: config.description,
    })
  }, [config.type, config.estimatedLoss, config.description])

  const { schedule, flush, flushAll } = useDeferredFieldUpdates<'estimatedLoss' | 'description'>((field, value) => {
    onUpdate(field, value)
  })

  const handleTypeChange = useCallback((value: ImpactType) => {
    setDraft((prev) => ({ ...prev, type: value }))
    onUpdate('type', value)
  }, [onUpdate])

  const handleLossChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextValue = e.target.value
    setDraft((prev) => ({ ...prev, estimatedLoss: nextValue }))
    schedule('estimatedLoss', nextValue)
  }, [schedule])

  const handleDescriptionChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const nextValue = e.target.value
    setDraft((prev) => ({ ...prev, description: nextValue }))
    schedule('description', nextValue)
  }, [schedule])

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
          <CardTitle className="text-lg font-mono text-secondary">Vulnerability Classification</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-2">
            <Label htmlFor="impact-type" className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
              Vulnerability Type
            </Label>
            <Select value={draft.type} onValueChange={handleTypeChange}>
              <SelectTrigger id="impact-type" className="font-mono bg-background/50">
                <SelectValue placeholder="Select impact type" />
              </SelectTrigger>
              <SelectContent className="bg-card border-primary/20">
                {IMPACT_TYPES.map((type) => (
                  <SelectItem 
                    key={type.value} 
                    value={type.value}
                    className="font-mono focus:bg-primary/10"
                  >
                    <div className="flex flex-col gap-1">
                      <span className="font-semibold">{type.label}</span>
                      <span className="text-xs text-muted-foreground">{type.description}</span>
                    </div>
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
            <Label htmlFor="estimated-loss" className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
              Estimated Loss (ETH in wei)
            </Label>
            <Input
              id="estimated-loss"
              type="number"
              value={draft.estimatedLoss}
              onChange={handleLossChange}
              onBlur={() => flush('estimatedLoss')}
              placeholder="e.g. 1000000000000000000000 (1000 ETH)"
              className="font-mono bg-background/50"
            />
            <p className="text-xs text-muted-foreground">
              Enter the amount in wei (1 ETH = 10<sup>18</sup> wei)
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="impact-description" className="text-muted-foreground font-mono text-xs uppercase tracking-wider">
              Impact Description
            </Label>
            <Textarea
              id="impact-description"
              rows={4}
              value={draft.description}
              onChange={handleDescriptionChange}
              onBlur={() => flush('description')}
              placeholder="Describe the vulnerability impact and how the exploit works..."
              className="font-mono bg-background/50 resize-y min-h-[100px]"
            />
          </div>
        </CardContent>
      </Card>
      
      <div className="flex justify-between items-center mt-8">
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
    </div>
  )
})

ImpactStep.displayName = 'ImpactStep'
