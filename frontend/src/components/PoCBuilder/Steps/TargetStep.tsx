import React, { useCallback } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import type { TargetConfig } from '../../../types/poc'
import { CodeEditor } from '../../CodeEditor'
import { StepGuidance, STEP_GUIDES } from '../../StepGuidance'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '../../ui/form'
import { Input } from '../../ui/input'
import { Button } from '../../ui/button'
import { 
  targetConfigSchema, 
  type TargetConfigFormData,
  chainOptions 
} from '../../../lib/validations/poc'

interface TargetStepProps {
  config: TargetConfig
  onUpdate: (field: keyof TargetConfig, value: string) => void
  onNext: () => void
  onLoadExample?: () => void
}

export const TargetStep: React.FC<TargetStepProps> = React.memo(({ 
  config, 
  onUpdate, 
  onNext, 
  onLoadExample 
}) => {
  const form = useForm<TargetConfigFormData>({
    resolver: zodResolver(targetConfigSchema),
    defaultValues: {
      targetContract: config.targetContract,
      chain: config.chain as typeof chainOptions[number],
      forkBlock: config.forkBlock,
      abiJson: config.abiJson,
    },
    mode: 'onChange',
  })

  const handleFieldChange = useCallback((
    field: keyof TargetConfig, 
    onChange: (value: string) => void
  ) => {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const value = e.target.value
      onChange(value)
      onUpdate(field, value)
    }
  }, [onUpdate])

  const handleAbiChange = useCallback((value: string) => {
    form.setValue('abiJson', value, { shouldValidate: true })
    onUpdate('abiJson', value)
  }, [form, onUpdate])

  const handleSubmit = useCallback((data: TargetConfigFormData) => {
    Object.entries(data).forEach(([key, value]) => {
      onUpdate(key as keyof TargetConfig, value)
    })
    onNext()
  }, [onUpdate, onNext])

  return (
    <div className="step-content">
      <StepGuidance {...STEP_GUIDES.target} />
      
      <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '1.5rem' }}>
        {onLoadExample && (
          <Button 
            type="button"
            variant="outline"
            size="sm"
            onClick={onLoadExample}
            className="font-mono text-xs tracking-wider border-[var(--color-secondary)] text-[var(--color-secondary)] hover:bg-[var(--color-secondary)] hover:text-[var(--color-bg)]"
          >
            [ LOAD_EXAMPLE_POC ]
          </Button>
        )}
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-6">
          <FormField
            control={form.control}
            name="targetContract"
            render={({ field }) => (
              <FormItem>
                <FormLabel className="text-[var(--color-text)] text-sm font-medium">
                  Target Contract Address
                </FormLabel>
                <FormControl>
                  <Input
                    {...field}
                    placeholder="0x..."
                    onChange={handleFieldChange('targetContract', field.onChange)}
                    className="bg-[var(--color-bg)] border-[var(--color-text-dim)] text-[var(--color-text)] font-mono text-sm focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                  />
                </FormControl>
                <FormMessage className="text-[var(--color-error)] text-xs" />
              </FormItem>
            )}
          />

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
            <FormField
              control={form.control}
              name="chain"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[var(--color-text)] text-sm font-medium">
                    Chain
                  </FormLabel>
                  <FormControl>
                    <select 
                      value={field.value} 
                      onChange={handleFieldChange('chain', field.onChange)}
                      className="flex h-10 w-full rounded-md border border-[var(--color-text-dim)] bg-[var(--color-bg)] px-3 py-2 text-sm text-[var(--color-text)] font-mono focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)] cursor-pointer"
                    >
                      <option value="Mainnet">Ethereum Mainnet</option>
                      <option value="Sepolia">Sepolia Testnet</option>
                      <option value="Optimism">Optimism</option>
                      <option value="Arbitrum">Arbitrum</option>
                    </select>
                  </FormControl>
                  <FormMessage className="text-[var(--color-error)] text-xs" />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="forkBlock"
              render={({ field }) => (
                <FormItem>
                  <FormLabel className="text-[var(--color-text)] text-sm font-medium">
                    Fork Block Number
                  </FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      type="text"
                      placeholder="e.g. 18500000"
                      onChange={handleFieldChange('forkBlock', field.onChange)}
                      className="bg-[var(--color-bg)] border-[var(--color-text-dim)] text-[var(--color-text)] font-mono text-sm focus:border-[var(--color-primary)] focus:ring-1 focus:ring-[var(--color-primary)]"
                    />
                  </FormControl>
                  <FormMessage className="text-[var(--color-error)] text-xs" />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="abiJson"
            render={({ field, fieldState }) => (
              <FormItem>
                <FormLabel className="text-[var(--color-text-dim)] text-sm font-medium">
                  Contract ABI (JSON)
                </FormLabel>
                <FormControl>
                  <div className="abi-upload-area">
                    <CodeEditor
                      value={field.value}
                      onChange={handleAbiChange}
                      language="json"
                      height={280}
                      placeholder='[{"inputs":[],"name":"withdraw","outputs":[],"stateMutability":"nonpayable","type":"function"}]'
                      error={fieldState.error?.message}
                    />
                  </div>
                </FormControl>
                <FormMessage className="text-[var(--color-error)] text-xs" />
              </FormItem>
            )}
          />

          <div style={{ marginTop: '2rem', textAlign: 'right' }}>
            <Button 
              type="submit"
              className="font-mono text-base px-8 py-3 bg-[var(--color-primary)] text-[var(--color-bg)] hover:bg-[var(--color-primary)]/90 tracking-wider"
            >
              NEXT &gt;&gt;
            </Button>
          </div>
        </form>
      </Form>
    </div>
  )
})

TargetStep.displayName = 'TargetStep'
